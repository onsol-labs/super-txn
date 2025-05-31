import pretty from "pino-pretty";
import pino from "pino";

const stream = pretty({
  colorize: true
})
const logger = pino(stream)

export default logger;
