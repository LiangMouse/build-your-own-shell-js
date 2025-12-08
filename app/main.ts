import { createInterface } from "readline";
import path from "path";
import { accessSync, constants, writeFileSync } from "fs";
import { spawnSync } from "child_process";

const BUILTIN_COMMANDS = ["cd", "echo", "exit", "pwd", "type"];
const pathEnv = process.env.PATH;
const directories = pathEnv!.split(path.delimiter);
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface ParsedInput {
  command: string;
  args: string[];
  redirectTarget?: string;
}

// 统一处理「写入 stdout 或重定向到文件」
function writeLine(output: string, redirectTarget?: string) {
  const text = output + "\n";
  if (redirectTarget) {
    writeFileSync(redirectTarget, text);
  } else {
    process.stdout.write(text);
  }
}

function parseInput(line: string): ParsedInput {
  const args: string[] = [];
  let currentArg = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  const specialCharactersForSlash = ["\\", "$", '"', "\n"];

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    // 1. 反斜杠处理：优先级最高
    if (char === "\\") {
      if (inSingleQuote) {
        // 单引号内：反斜杠不具特殊含义，当作普通字符
        currentArg += char;
      } else if (inDoubleQuote) {
        // 双引号内：只对少数字符进行转义
        const nextChar = line[i + 1];
        if (specialCharactersForSlash.includes(nextChar)) {
          currentArg += nextChar;
          i++; // 跳过被转义的字符
        } else {
          // 其他情况保留反斜杠本身
          currentArg += char;
        }
      } else {
        // 不在任何引号中：转义紧随其后的一个字符（包括空格、引号等）
        if (i + 1 < line.length) {
          currentArg += line[i + 1];
          i++;
        }
      }
      continue;
    }

    // 2. 双引号处理：仅其不在单引号中时才生效
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      // 引号本身不进入参数
      continue;
    }

    // 3. 单引号处理：仅在不在双引号中时才生效
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      // 引号本身不进入参数
      continue;
    }

    // 4. 空格：仅在未被任何引号包裹时作为分隔符
    if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (currentArg.length > 0) {
        args.push(currentArg);
        currentArg = "";
      }
      continue;
    }

    // 5. 普通字符：追加到当前参数
    currentArg += char;
  }

  if (currentArg.length > 0) {
    args.push(currentArg);
  }

  if (args.length === 0) {
    return { command: "", args: [] };
  }

  const command = args[0];
  const rawArgs = args.slice(1);

  // 处理输出重定向：支持 `>` 和 `1>`，例如
  // ls /tmp/baz > /tmp/foo/baz.md
  // echo hi 1>/tmp/foo/bar.md
  let redirectTarget: string | undefined;
  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i];

    if (token === ">" || token === "1>") {
      if (i + 1 < rawArgs.length) {
        redirectTarget = rawArgs[i + 1];
        rawArgs.splice(i, 2);
      }
      break;
    }

    if (token.startsWith(">") || token.startsWith("1>")) {
      const offset = token.startsWith("1>") ? 2 : 1;
      const target = token.slice(offset);
      if (target.length > 0) {
        redirectTarget = target;
        rawArgs.splice(i, 1);
      }
      break;
    }
  }

  return { command, args: rawArgs, redirectTarget };
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

function handleEcho(args: string[], redirectTarget?: string) {
  const output = args.join(" ");
  writeLine(output, redirectTarget);
}

function handleType(args: string[], redirectTarget?: string) {
  const commandName = args[0];

  if (!commandName) {
    const msg = "type: missing operand";
    writeLine(msg, redirectTarget);
    return;
  }

  // 步骤1: 检查是否是 builtin 命令
  if (BUILTIN_COMMANDS.includes(commandName)) {
    const msg = `${commandName} is a shell builtin`;
    writeLine(msg, redirectTarget);
    return;
  }

  // 步骤2: 遍历 PATH 中的每个目录
  for (const dir of directories) {
    const fullPath = path.join(dir, commandName);

    try {
      // 检查文件是否存在且有执行权限
      accessSync(fullPath, constants.X_OK);
      // 如果到这里没有抛异常，说明文件存在且有执行权限
      const msg = `${commandName} is ${fullPath}`;
      writeLine(msg, redirectTarget);
      return;
    } catch (error) {
      // 文件不存在或没有执行权限，继续下一个目录
      continue;
    }
  }

  // 步骤3: 所有目录都没找到
  const msg = `${commandName}: not found`;
  writeLine(msg, redirectTarget);
}

function handleNotFound(
  command: string,
  args: string[],
  redirectTarget?: string
) {
  const execName = command;
  for (const dir of directories) {
    const fullPath = path.join(dir, execName);
    try {
      accessSync(fullPath, constants.X_OK);
      // Execute the program with arguments
      if (redirectTarget) {
        const result = spawnSync(fullPath, args, {
          stdio: ["inherit", "pipe", "inherit"],
          argv0: command,
        });
        const stdoutData = result.stdout ?? "";
        writeFileSync(redirectTarget, stdoutData);
      } else {
        spawnSync(fullPath, args, {
          stdio: "inherit",
          argv0: command,
        });
      }
      return;
    } catch {
      continue;
    }
  }
  console.log(`${command}: command not found`);
}
function prompt() {
  rl.question("$ ", (input: string) => {
    const { command, args, redirectTarget } = parseInput(input);
    switch (true) {
      case command === "cd":
        handleCd(args);
        break;
      case command === "exit":
        rl.close();
        return;
      case command === "echo":
        handleEcho(args, redirectTarget);
        break;
      // print working directory
      case command === "pwd": {
        const cwd = process.cwd();
        writeLine(cwd, redirectTarget);
        break;
      }
      case command === "type":
        handleType(args, redirectTarget);
        break;

      default:
        handleNotFound(command, args, redirectTarget);
    }
    prompt();
  });
}

prompt();
