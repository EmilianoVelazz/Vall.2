'use strict';

class ToolRegistry {
    constructor() { this.tools = new Map(); }
    register(definition) {
        if (!definition?.name || typeof definition.execute !== 'function') throw new TypeError('Herramienta inválida');
        this.tools.set(definition.name, Object.freeze({ ...definition }));
    }
    describe() {
        return [...this.tools.values()].map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
    }
    async execute(name, input, context) {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Herramienta no registrada: ${name}`);
        return tool.execute(input, context);
    }
}

module.exports = { ToolRegistry };
