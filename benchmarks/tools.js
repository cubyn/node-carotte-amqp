const progress = require('progress');

const stats = {
    MEM_MAX: 0,
    MEM_MIN: Infinity,
    MEM_AVG: 0,
    MEM_INIT: process.memoryUsage().heapUsed
};

let MEM_SUM = 0;
let REC_COUNT = 0;
let TICK_COUNT = 0;

function recordStats() {
    const mem = process.memoryUsage();
    MEM_SUM += mem.heapUsed;
    stats.MEM_AVG = MEM_SUM / ++REC_COUNT;
    stats.MEM_MAX = (stats.MEM_MAX < mem.heapUsed) ? mem.heapUsed : stats.MEM_MAX;
    stats.MEM_MIN = (stats.MEM_MIN > mem.heapUsed) ? mem.heapUsed : stats.MEM_MIN;
}

const startTime = Date.now();
function printStats() {
    const executionTime = (Date.now()-startTime)/1000;
    console.log('################MEMORY#####################');
    console.log(`# Average memory: ${stats.MEM_AVG/1048576} MB`);
    console.log(`# MAX memory: ${stats.MEM_MAX/1048576} MB`);
    console.log(`# MIN memory: ${stats.MEM_MIN/1048576} MB`);
    console.log(`# END memory: ${process.memoryUsage().heapUsed/1048576} MB`);
    console.log('################MEMORY#####################');
    console.log(`Execution time: ${executionTime} sec.`);
    console.log(`Average: ${executionTime/TICK_COUNT} sec.`);
    console.log(`Rate: ${TICK_COUNT/executionTime}/sec.`);
}

let bar;
let iterationStep = 0;
let iterationEnd = 0;
function start(endIndex) {
    iterationStep = parseInt(endIndex / 100);
    iterationEnd = endIndex;
    bar = new progress(`Running benchmark [:bar] with ${endIndex} items`, { total: iterationStep });
}

function end() {
    recordStats();
    printStats();
    process.exit(1);
}

function tick() {
    if (++TICK_COUNT % 100 === 0) {
        recordStats();
        bar.tick();
    }

    if (TICK_COUNT === iterationEnd) {
        end();
    }
}

module.exports = {
    printStats,
    start,
    tick
};
