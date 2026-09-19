// Vitest reporter that enforces the FE-ID coverage of SPEC §7.9 (Q-16): after a FULL run it makes
// the test command fail (exit code 1) when a required FE-ID has no passing test, or when a
// `@spec` tag names an unknown ID. A run filtered by file or by test name only validates the tags.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Reporter, TestModule, Vitest } from "vitest/node";
import { evaluateCoverage, type TestOutcome } from "./core.ts";

export class SpecCoverageReporter implements Reporter {
  private vitest!: Vitest;

  onInit(vitest: Vitest): void {
    this.vitest = vitest;
  }

  async onTestRunEnd(testModules: ReadonlyArray<TestModule>): Promise<void> {
    const config = this.vitest.config;
    // Watch mode re-runs subsets and the CLI may narrow the run: coverage is only demanded when the
    // whole suite ran.
    const allSpecs = await this.vitest.globTestSpecifications();
    const fullRun = !config.watch && !config.testNamePattern && testModules.length >= allSpecs.length;

    const tests: TestOutcome[] = [];
    for (const module of testModules) {
      for (const test of module.children.allTests()) {
        tests.push({ fullName: test.fullName, state: test.result().state as TestOutcome["state"] });
      }
    }

    const specPath = path.resolve(config.root, "..", "SPEC.md");
    const report = evaluateCoverage(readFileSync(specPath, "utf-8"), tests, { fullRun });

    const out = (line: string) => process.stdout.write(`${line}\n`);
    out("");
    out(`SPEC required frontend test-ID coverage (SPEC §7.9): required ${report.required.length}, covered ${report.covered.length}${fullRun ? "" : " (filtered run: coverage not enforced)"}`);
    for (const error of report.errors) out(`  ERROR: ${error}`);
    if (report.missing.length > 0) out(`  Missing required FE IDs (no passing test): ${report.missing.join(", ")}`);
    if (report.ok && fullRun) out("  All required FE IDs have at least one passing test.");
    if (!report.ok) process.exitCode = 1;
  }
}
