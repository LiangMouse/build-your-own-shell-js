import { createInterface, emitKeypressEvents } from "readline";
import path from "path";
import {
  accessSync,
  constants,
  writeFileSync,
  appendFileSync,
  readdirSync,
} from "fs";
import { spawnSync } from "child_process";

const BUILTIN_COMMANDS = ["cd", "echo", "exit", "pwd", "type"];

const pathEnv = process.env.PATH;
const directories = pathEnv!.split(path.delimiter);

emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}

let tabPressCount = 0;
process.stdin.on("keypress", (str, key) => {
  if (key && key.name === "tab") {
    tabPressCount++;
  } else {
    tabPressCount = 0;
  }
});

// 计算最长公共前缀
function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  if (strings.length === 1) return strings[0];

  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (strings[i].indexOf(prefix) !== 0) {
      prefix = prefix.slice(0, -1);
      if (prefix === "") return "";
    }
  }
  return prefix;
}

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: (line: string) => {
    // 提取当前行的第一个词（命令部分）
    const trimmedLine = line.trim();
    const firstSpaceIndex = trimmedLine.indexOf(" ");
    const commandPart =
      firstSpaceIndex === -1
        ? trimmedLine
        : trimmedLine.slice(0, firstSpaceIndex);

    // 如果没有输入或已经输入完整命令，不补全
    if (commandPart.length === 0) {
      return [[], ""];
    }

    // 检查是否匹配支持补全的命令
    const candidates = new Set<string>();

    // 1. 内置命令
    for (const cmd of BUILTIN_COMMANDS) {
      if (cmd.startsWith(commandPart)) {
        candidates.add(cmd);
      }
    }

    // 2. 外部命令 (遍历 PATH)
    for (const dir of directories) {
      try {
        const files = readdirSync(dir);
        for (const file of files) {
          if (file.startsWith(commandPart)) {
            candidates.add(file);
          }
        }
      } catch (err) {
        // 忽略无法读取的目录
      }
    }

    const sortedCandidates = Array.from(candidates).sort();

    if (sortedCandidates.length === 0) {
      process.stdout.write("\x07");
      return [[], commandPart];
    }

    // 如果只有一个匹配，返回补全结果（加空格）
    if (sortedCandidates.length === 1) {
      return [[sortedCandidates[0] + " "], commandPart];
    }

    // 如果有多个匹配，计算最长公共前缀
    if (sortedCandidates.length > 1) {
      const lcp = longestCommonPrefix(sortedCandidates);

      // 如果 LCP 比当前输入长，补全到 LCP
      if (lcp.length > commandPart.length) {
        return [[lcp], commandPart];
      }

      // 如果已经是 LCP，按两次 TAB 显示所有匹配
      if (tabPressCount >= 2) {
        process.stdout.write("\n" + sortedCandidates.join("  ") + "\n");
        rl.prompt(true);
      } else {
        process.stdout.write("\x07");
      }
      return [[], commandPart];
    }

    return [[], commandPart];
  },
});

interface ParsedInput {
  command: string;
  args: string[];
  redirectTarget?: string;
  redirectErrorTarget?: string;
  appendStdout?: boolean; // true 表示使用 >>，false 表示使用 >
  appendStderr?: boolean; // true 表示使用 2>>，false 表示使用 2>
}

// 统一处理「写入 stdout 或重定向到文件」
function writeLine(output: string, redirectTarget?: string, append?: boolean) {
  const text = output + "\n";
  if (redirectTarget) {
    if (append) {
      appendFileSync(redirectTarget, text);
    } else {
      writeFileSync(redirectTarget, text);
    }
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

  // 处理输出重定向：支持
  //   - 标准输出覆盖：">", "1>", ">/path", "1>/path"
  //   - 标准输出追加：">>", "1>>", ">>/path", "1>>/path"
  //   - 标准错误覆盖："2>", "2>/path"
  //   - 标准错误追加："2>>", "2>>/path"
  let redirectTarget: string | undefined;
  let redirectErrorTarget: string | undefined;
  let appendStdout = false;
  let appendStderr = false;
  const filteredArgs: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const token = rawArgs[i];

    // 检查是否是重定向操作符（覆盖或追加）
    if (
      token === ">" ||
      token === ">>" ||
      token === "1>" ||
      token === "1>>" ||
      token === "2>" ||
      token === "2>>"
    ) {
      if (i + 1 < rawArgs.length) {
        const target = rawArgs[i + 1];
        const isAppend = token.includes(">>");
        if (token.startsWith("2")) {
          redirectErrorTarget = target;
          appendStderr = isAppend;
        } else {
          redirectTarget = target;
          appendStdout = isAppend;
        }
        i += 1; // 跳过目标路径
        continue;
      }
    } else if (
      token.startsWith("1>>") ||
      token.startsWith("2>>") ||
      token.startsWith(">>")
    ) {
      // 追加模式：">>/path", "1>>/path", "2>>/path"
      const isStdoutWithOne = token.startsWith("1>>");
      const isStderr = token.startsWith("2>>");
      const offset = isStdoutWithOne || isStderr ? 3 : 2;
      const target = token.slice(offset);
      if (target.length > 0) {
        if (isStderr) {
          redirectErrorTarget = target;
          appendStderr = true;
        } else {
          redirectTarget = target;
          appendStdout = true;
        }
        continue;
      }
    } else if (
      token.startsWith("1>") ||
      token.startsWith("2>") ||
      token.startsWith(">")
    ) {
      // 覆盖模式：">/path", "1>/path", "2>/path"
      const isStdoutWithOne = token.startsWith("1>");
      const isStderr = token.startsWith("2>");
      const offset = isStdoutWithOne || isStderr ? 2 : 1;
      const target = token.slice(offset);
      if (target.length > 0) {
        if (isStderr) {
          redirectErrorTarget = target;
          appendStderr = false;
        } else {
          redirectTarget = target;
          appendStdout = false;
        }
        continue;
      }
    }

    filteredArgs.push(token);
  }

  return {
    command,
    args: filteredArgs,
    redirectTarget,
    redirectErrorTarget,
    appendStdout,
    appendStderr,
  };
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

function handleEcho(args: string[], redirectTarget?: string, append?: boolean) {
  const output = args.join(" ");
  writeLine(output, redirectTarget, append);
}

function handleType(args: string[], redirectTarget?: string, append?: boolean) {
  const commandName = args[0];

  if (!commandName) {
    const msg = "type: missing operand";
    writeLine(msg, redirectTarget, append);
    return;
  }

  // 步骤1: 检查是否是 builtin 命令
  if (BUILTIN_COMMANDS.includes(commandName)) {
    const msg = `${commandName} is a shell builtin`;
    writeLine(msg, redirectTarget, append);
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
      writeLine(msg, redirectTarget, append);
      return;
    } catch (error) {
      // 文件不存在或没有执行权限，继续下一个目录
      continue;
    }
  }

  // 步骤3: 所有目录都没找到
  const msg = `${commandName}: not found`;
  writeLine(msg, redirectTarget, append);
}

function handleNotFound(
  command: string,
  args: string[],
  redirectTarget?: string,
  redirectErrorTarget?: string,
  appendStdout?: boolean,
  appendStderr?: boolean
) {
  const execName = command;
  for (const dir of directories) {
    const fullPath = path.join(dir, execName);
    try {
      accessSync(fullPath, constants.X_OK);
      // Execute the program with arguments
      if (redirectTarget && redirectErrorTarget) {
        const result = spawnSync(fullPath, args, {
          stdio: ["inherit", "pipe", "pipe"],
          argv0: command,
        });
        const stdoutData = result.stdout ?? "";
        const stderrData = result.stderr ?? "";
        if (appendStdout) {
          appendFileSync(redirectTarget, stdoutData);
        } else {
          writeFileSync(redirectTarget, stdoutData);
        }
        if (appendStderr) {
          appendFileSync(redirectErrorTarget, stderrData);
        } else {
          writeFileSync(redirectErrorTarget, stderrData);
        }
      } else if (redirectTarget) {
        const result = spawnSync(fullPath, args, {
          stdio: ["inherit", "pipe", "inherit"],
          argv0: command,
        });
        const stdoutData = result.stdout ?? "";
        if (appendStdout) {
          appendFileSync(redirectTarget, stdoutData);
        } else {
          writeFileSync(redirectTarget, stdoutData);
        }
      } else if (redirectErrorTarget) {
        const result = spawnSync(fullPath, args, {
          stdio: ["inherit", "inherit", "pipe"],
          argv0: command,
        });
        const stderrData = result.stderr ?? "";
        if (appendStderr) {
          appendFileSync(redirectErrorTarget, stderrData);
        } else {
          writeFileSync(redirectErrorTarget, stderrData);
        }
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
    const {
      command,
      args,
      redirectTarget,
      redirectErrorTarget,
      appendStdout,
      appendStderr,
    } = parseInput(input);

    // 提前创建/清空重定向目标文件，模拟真实 shell 中的行为
    // 注意：只有在覆盖模式（>）时才清空文件，追加模式（>>）不清空
    if (redirectTarget && !appendStdout) {
      writeFileSync(redirectTarget, "");
    }
    if (redirectErrorTarget && !appendStderr) {
      writeFileSync(redirectErrorTarget, "");
    }

    switch (true) {
      case command === "cd":
        handleCd(args);
        break;
      case command === "exit":
        rl.close();
        return;
      case command === "echo":
        handleEcho(args, redirectTarget, appendStdout);
        break;
      // print working directory
      case command === "pwd": {
        const cwd = process.cwd();
        writeLine(cwd, redirectTarget, appendStdout);
        break;
      }
      case command === "type":
        handleType(args, redirectTarget, appendStdout);
        break;

      default:
        handleNotFound(
          command,
          args,
          redirectTarget,
          redirectErrorTarget,
          appendStdout,
          appendStderr
        );
    }
    prompt();
  });
}

prompt();
