import productionLogger from './production.js';
import devLogger from './dev.js';

const logger = process.env.NODE_ENV === 'production' ? productionLogger() : devLogger();

export default logger;
