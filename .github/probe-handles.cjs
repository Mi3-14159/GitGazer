// TEMPORARY: preloaded via NODE_OPTIONS to report what keeps a process alive after its work is done.
const path = require('path');

const started = Date.now();
const tag = `${process.pid} ${path.basename(process.argv[1] ?? 'node')}`;

const names = (list) => JSON.stringify((list ?? []).map(describe));

function describe(handle) {
    const name = handle?.constructor?.name ?? typeof handle;
    if (name === 'ChildProcess') {
        const argv = [handle.spawnfile, ...(handle.spawnargs ?? []).slice(1)].join(' ');
        return `ChildProcess(pid=${handle.pid} connected=${handle.connected} ${argv}`.slice(0, 220) + ')';
    }
    return name;
}

setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(
        `[probe ${tag} +${seconds}s] resources=${JSON.stringify(process.getActiveResourcesInfo())}` +
            ` handles=${names(process._getActiveHandles?.())} requests=${names(process._getActiveRequests?.())}`,
    );
}, 15000).unref();
