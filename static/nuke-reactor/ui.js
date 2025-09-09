import { Reactor, ReactorStatus } from './reactor.js';

// --- UI Controller ---
document.addEventListener('DOMContentLoaded', () => {
    const reactor = new Reactor();

    const ui = {
        powerButton: document.getElementById('power-button'),
        autoSwitch: document.getElementById('auto-control-switch'),
        fissionNeedle: document.querySelector('#fission-rate-gauge .gauge-needle'),
        fissionValue: document.getElementById('fission-rate-value'),
        fissionSlider: document.getElementById('fission-rate-slider'),
        turbineNeedle: document.querySelector('#turbine-output-gauge .gauge-needle'),
        turbineValue: document.getElementById('turbine-output-value'),
        turbineSlider: document.getElementById('turbine-output-slider'),
        tempValue: document.getElementById('temp-value'),
        powerLoad: document.getElementById('power-load'),
        powerOutput: document.getElementById('power-output'),
        graphCanvas: document.getElementById('history-graph'),
        tempScale: document.getElementById('temp-scale'),
        powerScale: document.getElementById('power-scale'),
        criticalHeat: document.getElementById('critical-heat'),
        criticalOutput: document.getElementById('critical-output'),
        statusLights: {
            [ReactorStatus.TempLow]: document.getElementById('status-temp-low'),
            [ReactorStatus.Overheat]: document.getElementById('status-overheat'),
            [ReactorStatus.OutputLow]: document.getElementById('status-output-low'),
            [ReactorStatus.OutputHigh]: document.getElementById('status-output-high'),
            [ReactorStatus.FuelLow]: document.getElementById('status-fuel-low'),
            [ReactorStatus.FuelOut]: document.getElementById('status-fuel-out'),
            [ReactorStatus.Meltdown]: document.getElementById('status-meltdown'),
            [ReactorStatus.Scram]: document.getElementById('status-scram'),
        }
    };

    const graphCtx = ui.graphCanvas.getContext('2d');
    let graphHistory = [];
    const MAX_HISTORY = 200;

    function createTicks(gaugeBody) {
        const ticksContainer = gaugeBody.querySelector('.gauge-ticks');
        ticksContainer.innerHTML = '';
        for (let i = 0; i <= 10; i++) {
            const angle = -90 + (i * 18);
            const tickWrapper = document.createElement('div');
            tickWrapper.style.cssText = `position:absolute; left:0; top:0; width:200px; height:100px; transform: rotate(${angle}deg); transform-origin: 100px 100px;`;
            const tick = document.createElement('div');
            const isMajor = i % 5 === 0;
            tick.style.cssText = `position:absolute; left:99.5px; top:0; width:1px; height:${isMajor ? '10px' : '5px'}; background-color: ${isMajor ? 'var(--text-color)' : 'var(--text-dark)'};`;
            tickWrapper.appendChild(tick);
            ticksContainer.appendChild(tickWrapper);
            if (i % 2 === 0) {
               const label = document.createElement('div');
               label.className = 'tick-label';
               label.textContent = i * 10;
               const labelAngleRad = angle * (Math.PI / 180);
               const radius = 85;
               const x = 100 + radius * Math.sin(labelAngleRad);
               const y = 100 - radius * Math.cos(labelAngleRad);
               label.style.left = `${x}px`;
               label.style.top = `${y}px`;
               label.style.transform = 'translate(-50%, -50%)';
               ticksContainer.appendChild(label);
            }
        }
    }
    createTicks(document.getElementById('fission-rate-gauge'));
    createTicks(document.getElementById('turbine-output-gauge'));

    function populateScales() {
        const tempScaleDiv = ui.tempScale;
        const powerScaleDiv = ui.powerScale;
        tempScaleDiv.innerHTML = '';
        powerScaleDiv.innerHTML = '';
        
        const numLabels = 5;
        for(let i = 0; i < numLabels; i++) {
            // Temperature Scale (left)
            const tempLabel = document.createElement('div');
            const tempValue = reactor.MAX_TEMP * (1 - (i / (numLabels - 1)));
            tempLabel.textContent = `${tempValue}C`;
            // tempLabel.textContent = `${(tempValue/1000).toFixed(2)}k`;
            tempScaleDiv.appendChild(tempLabel);

            // Power Scale (right)
            const powerLabel = document.createElement('div');
            const powerValue = (reactor.MAX_POWER_OUTPUT * 0.75) * (1 - (i / (numLabels - 1)));
            powerLabel.textContent = `${(powerValue/1000).toFixed(1)}kW`;
            powerScaleDiv.appendChild(powerLabel);
        }
    }
    populateScales();


    ui.powerButton.addEventListener('click', () => reactor.getState().isPoweredOn ? reactor.powerOff() : reactor.powerOn());
    ui.autoSwitch.addEventListener('click', () => reactor.toggleAutoControl());
    ui.fissionSlider.addEventListener('input', (e) => reactor.setFissionRate(e.target.value));
    ui.turbineSlider.addEventListener('input', (e) => reactor.setTurbineOutput(e.target.value));
    ui.statusLights[ReactorStatus.Meltdown].addEventListener('click', () => reactor.scram());

    let lastTime = 0;
    let baseLoad = reactor.getState().powerLoad; // Initialize with starting load

    const spikeState = {
        isActive: false,
        startTime: 0,
        duration: 5000, // 5 seconds in milliseconds
        magnitude: 500, // 100 kW spike
        nextSpikeTime: 0
    };

    function scheduleNextSpike(currentTime) {
        const randomInterval = Math.random() * 5000 + 10000; // 10-15 seconds
        spikeState.nextSpikeTime = currentTime + randomInterval;
    }

    // Schedule the first spike
    scheduleNextSpike(performance.now());

    function gameLoop(currentTime) {
        if (!lastTime) lastTime = currentTime;
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        
        // --- Baseline Load Logic (Random Walk) ---
        const loadDelta = Math.floor(Math.random() * 25) - 12;
        baseLoad += loadDelta;
        if (baseLoad > 2200) baseLoad = 2100;
        if (baseLoad < 750) baseLoad = 800;
        
        // --- Spike Event Logic ---
        let spikeValue = 0;

        // Trigger a new spike if it's time
        if (!spikeState.isActive && currentTime >= spikeState.nextSpikeTime) {
            spikeState.isActive = true;
            spikeState.startTime = currentTime;
            scheduleNextSpike(currentTime);
        }

        // If a spike is active, calculate its current value
        if (spikeState.isActive) {
            const elapsed = currentTime - spikeState.startTime;
            if (elapsed >= spikeState.duration) {
                spikeState.isActive = false;
            } else {
                // Linear decay from magnitude to 0 over the duration
                const decayFactor = 1 - (elapsed / spikeState.duration);
                spikeValue = spikeState.magnitude * decayFactor;
            }
        }
        
        const finalLoad = baseLoad + spikeValue;
        reactor.setPowerLoad(finalLoad);

        reactor.update(deltaTime || 0);
        updateUI(reactor.getState());
        drawGraph();
        requestAnimationFrame(gameLoop);
    }

    function updateUI(state) {
        ui.powerButton.classList.toggle('on', state.isPoweredOn);
        ui.autoSwitch.classList.toggle('on', state.isAutoControl);

        ui.fissionNeedle.style.transform = `rotate(${-90 + state.fissionRate * 1.8}deg)`;
        ui.fissionValue.textContent = state.fissionRate.toFixed(0);
        ui.fissionSlider.value = state.fissionRate;
        ui.fissionSlider.disabled = state.isAutoControl;
        
        ui.turbineNeedle.style.transform = `rotate(${-90 + state.turbineOutput * 1.8}deg)`;
        ui.turbineValue.textContent = state.turbineOutput.toFixed(0);
        ui.turbineSlider.value = state.turbineOutput;
        ui.turbineSlider.disabled = state.isAutoControl;

        ui.tempValue.textContent = `${state.temperature.toFixed(0)}°C`;
        ui.powerLoad.textContent = `${state.powerLoad.toFixed(0)} KW`;
        ui.powerOutput.textContent = `${state.powerOutput.toFixed(0)} KW`;

        for (const [statusEnum, element] of Object.entries(ui.statusLights)) {
            element.classList.toggle('active', reactor.hasStatus(parseInt(statusEnum)));
        }
        
        const isCritOutput = reactor.hasStatus(ReactorStatus.OutputLow) || reactor.hasStatus(ReactorStatus.OutputHigh);
        const isCritHeat = reactor.hasStatus(ReactorStatus.Overheat) || reactor.hasStatus(ReactorStatus.Meltdown);
        ui.criticalHeat.classList.toggle('active', isCritHeat);
        ui.criticalOutput.classList.toggle('active', isCritOutput);

        graphHistory.push({
            temp: state.temperature,
            load: state.powerLoad,
            output: state.powerOutput
        });
        if (graphHistory.length > MAX_HISTORY) {
            graphHistory.shift();
        }
    }
    
    function drawGraph() {
        const canvas = ui.graphCanvas;
        const ctx = graphCtx;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (graphHistory.length < 2) return;

        function drawLine(dataKey, color, maxVal) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let i = 0; i < graphHistory.length; i++) {
                const point = graphHistory[i];
                const x = (i / (MAX_HISTORY - 1)) * canvas.width;
                const y = canvas.height - (point[dataKey] / maxVal) * canvas.height;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        drawLine('temp', 'yellow', reactor.MAX_TEMP);
        drawLine('load', 'blue', reactor.MAX_POWER_OUTPUT);
        drawLine('output', 'green', reactor.MAX_POWER_OUTPUT);
    }
    
    // Initial UI sync
    updateUI(reactor.getState());
    requestAnimationFrame(gameLoop);
});