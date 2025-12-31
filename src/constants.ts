import * as os from "os";
import * as path from "path";
import { name } from "../package.json";

export const NOTES_DIR = path.join(os.homedir(), ".code-annotations");

export const EXTENSION_NAME = name;
