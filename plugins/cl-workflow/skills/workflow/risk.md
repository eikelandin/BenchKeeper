# Risk class

The depth says how hard you work; the risk class says who approves. Write the class under the depth line, before the first edit: `Risk: <low|medium|high> (<reason in a few words>)`.

1. Read the facts: lines and files changed, files under the project's `riskyPaths` (in `docs/agents/orchestration.json` as the default branch has it), dependency manifests and lock files, migrations, and changed code files with no test. Where the `coordinate` skill is installed, its `risk-facts.mjs` prints them: `node <that skill folder>/risk-facts.mjs <repository path> <base> <head>`. Before the first edit, judge them from the task and the files it will touch.
2. Rate each low, medium or high:
   - **Impact**: blast radius, how hard the change is to reverse, security or data sensitivity. A file under `riskyPaths` alone makes it high.
   - **Likelihood** of a defect: diff size, novelty, test coverage of the touched files, your confidence.
3. Take the class from the matrix ([OWASP risk rating](https://owasp.org/www-community/OWASP_Risk_Rating_Methodology), its Note and Critical counted as low and high). Unsure: the higher one.

   | Impact | Likelihood low | medium | high |
   |---|---|---|---|
   | low | low | low | medium |
   | medium | low | medium | high |
   | high | medium | high | high |

- **Floors.** High sets the depth to deep and adds the security review before pushing; medium sets it to at least standard.
- **Raise, never lower.** You may raise a class someone gave (the user, a spec's `Risk:` line); you never lower one, nor go below the class the `riskyPaths` facts give.
- **Grows.** When the work turns out riskier than the class you wrote, write a new `Risk:` line, and the depth it floors, before the next edit. Under a coordinator's spec whose `Risk:` line is lower: stop and report as the spec's Needs replan says.
- **Pull request.** The Risk section opens with the `Risk:` line, its facts and the depth line.
