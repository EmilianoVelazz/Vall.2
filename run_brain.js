const { evaluateQueries } = require('./backend/ai/brain-worker');
async function run() {
    console.log("Iniciando evaluación...");
    await evaluateQueries();
    console.log("Evaluación terminada.");
    process.exit(0);
}
run();
