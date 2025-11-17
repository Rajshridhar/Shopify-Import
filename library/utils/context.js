import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

function setContext(context, fn) {
    return asyncLocalStorage.run(context, fn);
}

function getContext() {
    return asyncLocalStorage.getStore();
}

export { setContext, getContext };
