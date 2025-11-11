require('../../utils/logger');
function createParentBus(parentPort) {
  const subscribers = new Map();
  parentPort.on('message', (message) => {
    const set = subscribers.get(message.type);
    if (set) {for (const fn of set) {fn(message);}}
  });
  return {
    on(type, handler) {
      if (!subscribers.has(type)) {subscribers.set(type, new Set());}
      subscribers.get(type).add(handler);
      return () => subscribers.get(type).delete(handler);
    },
    postMessage(type, payload, priority = 'low') {
      parentPort.postMessage({ type, priority, payload });
    },
  };
}

function createChildBus(worker) {
  const subscribers = new Map();
  worker.on('message', (message) => {
    const set = subscribers.get(message.type);
    if (set) {for (const fn of set) {fn(message);}}
  });
  return {
    on(type, handler) {
      if (!subscribers.has(type)) {subscribers.set(type, new Set());}
      subscribers.get(type).add(handler);
      return () => subscribers.get(type).delete(handler);
    },
    postMessage(type, payload, priority = 'low') {
      worker.postMessage({ type, priority, payload });
    },
  };
}

module.exports = { createParentBus, createChildBus };


