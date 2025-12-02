import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});
function prompt() {
  rl.question("$ ", (answer: string) => {
    if (answer === "exit") {
      rl.close();
      return;
    }
    console.log(`${answer}: command not found`);
    prompt();
  });
}

prompt();
