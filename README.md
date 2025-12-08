[![progress-banner](https://backend.codecrafters.io/progress/shell/782a18e3-b235-4843-9699-4e4400afcc6a)](https://app.codecrafters.io/users/codecrafters-bot?r=2qF)

### 项目简介

这是一个使用 **TypeScript** 实现的简易 Shell（命令行解释器）项目，基于 `CodeCrafters` 提供的  
“Build Your Own Shell” 挑战（Shell 课程的具体阶段示例：  
[Shell 课程关卡页面](https://app.codecrafters.io/courses/shell)）。

目标是逐步实现一个接近 POSIX 语义的 Shell，支持解析命令、执行外部程序以及处理常见内建命令：

- **cd**: 切换工作目录
- **pwd**: 打印当前工作目录
- **echo**: 输出参数内容（包含引号、反斜杠等的处理）
- **exit**: 退出 Shell
- **type**: 判断命令是内建还是外部程序

整个项目的实现语言与注释均以 **中文** 为主，方便中文环境下学习与阅读。

### 代码结构

- **`app/main.ts`**: Shell 的入口文件与核心逻辑，包括：
  - 命令行读取循环（REPL）
  - 命令解析（含引号、反斜杠转义等逻辑）
  - 内建命令实现
  - 外部程序查找与执行
- **`your_program.sh`**: 本地运行脚本，会调用 `bun` 来执行 `app/main.ts`。

### 运行方式

- 本地环境需要安装 **bun (>= 1.2)**
- 在项目根目录执行：

```sh
./your_program.sh
```

你会看到一个简单的 Shell 提示符，类似：

```text
$
```

在这里可以尝试执行例如：

```text
$ echo "hello world"
$ pwd
$ cd /tmp
```

### 与 CodeCrafters 平台集成

本仓库最初是从 CodeCrafters 的 TypeScript 模板生成，用于完成 Shell 挑战各个关卡。  
推送代码到远端（CodeCrafters 提供的 Git 仓库）后，平台会自动拉起测试，用来验证：

- 命令解析是否符合预期（尤其是引号与反斜杠规则）
- 内建命令行为是否正确
- 外部程序是否能被正常查找和执行

如果你也想体验这个挑战，可以前往 [CodeCrafters Shell 课程](https://app.codecrafters.io/courses/shell/overview) 注册并创建自己的仓库。
