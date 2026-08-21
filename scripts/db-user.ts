/**
 * Create or update a contractor login.
 *
 *   npm run db:user -- --email sam@example.com --name "Sam Rep" [--role admin]
 *
 * Prompts for the password rather than taking it as an argument, so it does
 * not end up in shell history or in `ps`. There is no self-service signup:
 * the contractor console is not a place strangers get accounts.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { isDatabaseConfigured } from "../lib/db/client";
import { upsertContractor } from "../lib/auth/users";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Read a line without echoing it back to the terminal. */
async function readPassword(prompt: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const onKeypress = () => {
    // Repaint the prompt with nothing after it.
    stdout.write(`\r${prompt}`);
  };
  stdin.on("data", onKeypress);
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    stdin.off("data", onKeypress);
    rl.close();
    stdout.write("\n");
  }
}

async function main() {
  if (!isDatabaseConfigured()) {
    console.error(
      "No DATABASE_URL set. Without a database there is no user table — configure the single login with CONTRACTOR_EMAIL and CONTRACTOR_PASSWORD instead.",
    );
    process.exitCode = 1;
    return;
  }

  const email = arg("email");
  const name = arg("name");
  const role = arg("role") === "admin" ? ("admin" as const) : ("rep" as const);
  if (!email || !name) {
    console.error(
      'Usage: npm run db:user -- --email sam@example.com --name "Sam Rep" [--role admin]',
    );
    process.exitCode = 1;
    return;
  }

  const password = await readPassword("Password: ");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exitCode = 1;
    return;
  }

  const contractor = await upsertContractor({ email, name, password, role });
  console.log(`Contractor ${contractor.email} (${contractor.role}) ready.`);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
