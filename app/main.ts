import { createInterface } from "readline";
import path from "path";
import { accessSync, constants } from "fs";
import { spawnSync } from "child_process";

const BUILTIN_COMMANDS = ["cd", "echo", "exit", "pwd", "type"];
const pathEnv = process.env.PATH;
const directories = pathEnv!.split(path.delimiter);
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function parseInput(line: string): { command: string; args: string[] } {
  const args: string[] = [];
  let currentArg = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"' && !inDoubleQuote) {
      inDoubleQuote = true;
    } else if (char === '"' && inDoubleQuote) {
      inDoubleQuote = false;
    } else if (char === "'" && !inSingleQuote) {
      inSingleQuote = true;
    } else if (char === "'" && inSingleQuote) {
      inSingleQuote = false;
    } else if (char === " " && !inSingleQuote) {
      if (currentArg.length > 0) {
        args.push(currentArg);
        currentArg = "";
      }
    } else {
      currentArg += char;
    }
  }

  if (currentArg.length > 0) {
    args.push(currentArg);
  }

  const command = args[0] || "";
  const commandArgs = args.slice(1);
  return { command, args: commandArgs };
}
function handleCd(args: string[]) {
  const location = args[0];
  if (!location) {
    return;
  }

  let targetPath: string;
  if (location.startsWith("~")) {
    const home = process.env.HOME!;
    targetPath = path.join(home, location.slice(1));
  } else {
    targetPath = path.resolve(process.cwd(), location);
  }

  try {
    accessSync(targetPath, constants.F_OK);
    process.chdir(targetPath);
  } catch {
    console.log(`cd: ${location}: No such file or directory`);
  }
}
function handleEcho(args: string[]) {
  console.log(args.join(" "));
}
function handleType(args: string[]) {
  const commandName = args[0];

  if (!commandName) {
    console.log("type: missing operand");
    return;
  }

  // 步骤1: 检查是否是 builtin 命令
  if (BUILTIN_COMMANDS.includes(commandName)) {
    console.log(`${commandName} is a shell builtin`);
    return;
  }

  // 步骤2: 遍历 PATH 中的每个目录
  for (const dir of directories) {
    const fullPath = path.join(dir, commandName);

    try {
      // 检查文件是否存在且有执行权限
      accessSync(fullPath, constants.X_OK);
      // 如果到这里没有抛异常，说明文件存在且有执行权限
      console.log(`${commandName} is ${fullPath}`);
      return;
    } catch (error) {
      // 文件不存在或没有执行权限，继续下一个目录
      continue;
    }
  }

  // 步骤3: 所有目录都没找到
  console.log(`${commandName}: not found`);
}
function handleNotFound(command: string, args: string[]) {
  const execName = command;
  for (const dir of directories) {
    const fullPath = path.join(dir, execName);
    try {
      accessSync(fullPath, constants.X_OK);
      // Execute the program with arguments
      spawnSync(fullPath, args, {
        stdio: "inherit",
        argv0: command,
      });
      return;
    } catch {
      continue;
    }
  }
  console.log(`${command}: command not found`);
}
function prompt() {
  rl.question("$ ", (input: string) => {
    const { command, args } = parseInput(input);
    switch (true) {
      case command === "cd":
        handleCd(args);
        break;
      case command === "exit":
        rl.close();
        return;
      case command === "echo":
        handleEcho(args);
        break;
      // print working directory
      case command === "pwd":
        console.log(process.cwd());
        break;
      case command === "type":
        handleType(args);
        break;

      default:
        handleNotFound(command, args);
    }
    prompt();
  });
}

prompt();
