// --- The Reactor Simulation Class ---
const ReactorStatus = {
    None: 0, TempLow: 1 << 0, Overheat: 1 << 1, OutputLow: 1 << 2, OutputHigh: 1 << 3,
    FuelLow: 1 << 4, FuelOut: 1 << 5, Meltdown: 1 << 6, Scram: 1 << 7,
};

class Reactor {
    state;
    // --- Tuned Physics Constants ---
    MAX_TEMP = 1000;
    MAX_POWER_OUTPUT = 5000;
    MELTDOWN_TEMP = 900;
    OVERHEAT_TEMP = 600;
    LOW_TEMP = 200;
    OPTIMAL_TEMP = 350; // Target for auto-controller
    FUEL_CONSUMPTION_RATE = 0.05;
    HEAT_GENERATION_RATE = 800; // Retuned for stable output
    AMBIENT_TEMP_DISSIPATION = 0.05;
    TURBINE_POWER_FACTOR = 8;
    LOW_FUEL_THRESHOLD = 20;

    constructor() {
        // --- Calculate initial stable state for 1000 KW load ---
        const initialLoad = 1000;
        const initialTemp = this.OPTIMAL_TEMP;
        const initialTurbine = initialLoad / (initialTemp / 100 * (initialTemp/this.OVERHEAT_TEMP) * this.TURBINE_POWER_FACTOR);
        const heatConsumed = (initialLoad / this.TURBINE_POWER_FACTOR) + (initialTemp * this.AMBIENT_TEMP_DISSIPATION);
        const initialFission = (heatConsumed * 100) / this.HEAT_GENERATION_RATE;

        this.state = {
            isPoweredOn: true,
            isAutoControl: true,
            temperature: initialTemp,
            fissionRate: initialFission,
            turbineOutput: initialTurbine,
            powerOutput: initialLoad,
            powerLoad: initialLoad,
            fuelRod: { condition: 100 },
            status: ReactorStatus.None,
        };
    }

    update(deltaTime) {
        if (!this.state.isPoweredOn || this.hasStatus(ReactorStatus.Scram)) {
            this.shutdownCooling(deltaTime); this.updateStatusFlags(); return;
        }
        if (this.state.isAutoControl) this.runAutoControl();
        let heatGenerated = 0;
        if (this.state.fuelRod && this.state.fuelRod.condition > 0) {
            heatGenerated = (this.state.fissionRate / 100) * this.HEAT_GENERATION_RATE;
            this.state.temperature += heatGenerated * deltaTime;
            const fuelConsumed = (this.state.fissionRate / 100) * this.FUEL_CONSUMPTION_RATE * deltaTime;
            this.state.fuelRod.condition = Math.max(0, this.state.fuelRod.condition - fuelConsumed);
        }
        const tempEfficiency = Math.min(1, this.state.temperature / this.OVERHEAT_TEMP);
        const potentialPower = this.state.temperature * (this.state.turbineOutput / 100) * tempEfficiency;
        this.state.powerOutput = Math.min(this.MAX_POWER_OUTPUT, potentialPower * this.TURBINE_POWER_FACTOR);
        const heatConsumedByTurbine = this.state.powerOutput / this.TURBINE_POWER_FACTOR;
        const ambientCooling = this.state.temperature * this.AMBIENT_TEMP_DISSIPATION;
        this.state.temperature -= (heatConsumedByTurbine + ambientCooling) * deltaTime;
        this.state.temperature = Math.max(0, this.state.temperature);
        this.updateStatusFlags();
    }

    shutdownCooling(deltaTime) {
        this.state.fissionRate = 0;
        const tempEfficiency = Math.min(1, this.state.temperature / this.OVERHEAT_TEMP);
        const potentialPower = this.state.temperature * (this.state.turbineOutput / 100) * tempEfficiency;
        this.state.powerOutput = Math.min(this.MAX_POWER_OUTPUT, potentialPower * this.TURBINE_POWER_FACTOR);
        const heatConsumedByTurbine = this.state.powerOutput / this.TURBINE_POWER_FACTOR;
        const ambientCooling = this.state.temperature * (this.AMBIENT_TEMP_DISSIPATION * 2);
        this.state.temperature -= (heatConsumedByTurbine + ambientCooling) * deltaTime;
        this.state.temperature = Math.max(0, this.state.temperature);
        if (this.state.temperature <= 1) this.state.powerOutput = 0;
    }

    runAutoControl() {
        const powerError = this.state.powerLoad - this.state.powerOutput;
        this.state.turbineOutput += powerError * 0.01;
        const tempError = this.OPTIMAL_TEMP - this.state.temperature;
        this.state.fissionRate += tempError * 0.002;
        this.state.fissionRate = Math.max(0, Math.min(100, this.state.fissionRate));
        this.state.turbineOutput = Math.max(0, Math.min(100, this.state.turbineOutput));
    }

    updateStatusFlags() {
        // Preserve SCRAM status unless explicitly cleared
        let currentStatus = this.state.status & ReactorStatus.Scram;

        if (this.state.temperature >= this.MELTDOWN_TEMP) currentStatus |= ReactorStatus.Meltdown;
        else if (this.state.temperature >= this.OVERHEAT_TEMP) currentStatus |= ReactorStatus.Overheat;
        else if (this.state.temperature < this.LOW_TEMP && this.state.isPoweredOn && this.state.powerOutput > 0) currentStatus |= ReactorStatus.TempLow;
        
        const powerDifference = this.state.powerOutput - this.state.powerLoad;
        if (powerDifference > this.state.powerLoad * 0.2 && this.state.powerLoad > 100) currentStatus |= ReactorStatus.OutputHigh;
        if (powerDifference < -this.state.powerLoad * 0.2 && this.state.powerLoad > 100) currentStatus |= ReactorStatus.OutputLow;

        if (!this.state.fuelRod || this.state.fuelRod.condition <= 0) {
            currentStatus |= ReactorStatus.FuelOut;
            this.state.fuelRod = null;
        } else if (this.state.fuelRod.condition < this.LOW_FUEL_THRESHOLD) {
            currentStatus |= ReactorStatus.FuelLow;
        }
        this.state.status = currentStatus;
    }
    powerOn = () => { if (!this.state.isPoweredOn) { this.state.isPoweredOn = true; this.state.status &= ~ReactorStatus.Scram; }};
    powerOff = () => { if (this.state.isPoweredOn) { this.state.isPoweredOn = false; }};
    toggleAutoControl = () => this.state.isAutoControl = !this.state.isAutoControl;
    setFissionRate = (rate) => { if (!this.state.isAutoControl) this.state.fissionRate = Math.max(0, Math.min(100, parseFloat(rate))); };
    setTurbineOutput = (rate) => { if (!this.state.isAutoControl) this.state.turbineOutput = Math.max(0, Math.min(100, parseFloat(rate))); };
    setPowerLoad = (load) => this.state.powerLoad = Math.max(0, load);
    scram = () => { this.state.status |= ReactorStatus.Scram; this.state.isPoweredOn = false; };
    getState = () => this.state;
    hasStatus = (status) => (this.state.status & status) !== 0;
}

export { Reactor, ReactorStatus };