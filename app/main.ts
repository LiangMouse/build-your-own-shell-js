import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});
function prompt() {
  rl.question("$ ", (answer: string) => {
    // exit
    if (answer === "exit") {
      rl.close();
      return;
    }
    // echo
    if (answer.startsWith("echo")) {
      console.log(answer.slice(5));
    } else console.log(`${answer}: command not found`);
    prompt();
  });
}

prompt();
