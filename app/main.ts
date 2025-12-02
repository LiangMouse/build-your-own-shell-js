import { existsSync } from "fs";
import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const command_list = ["echo", "exit", "type"];
function prompt() {
  rl.question("$ ", (answer: string) => {
    switch (true) {
      case answer === "exit":
        rl.close();
        return;
      case answer.startsWith("type"):
        if (command_list.includes(answer.slice(5))) {
          console.log(`${answer.slice(5)} is a shell builtin`);
        } else {
          console.log("invalid_command: not found");
        }
        break;
      case answer.startsWith("echo"):
        console.log(answer.slice(5));
        break;
      default:
        console.log(`${answer}: command not found`);
    }
    prompt();
  });
}

prompt();
