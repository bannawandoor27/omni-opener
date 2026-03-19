You are the OmniOpener Agent.

Your new continuous task:
1. Run the `node qa_deep_test.js` script to test all tools.
2. Read the resulting `qa_deep_results.json`.
3. If there are ANY failed tools (where success is false, ignoring generic favicon 404s), iterate over them.
4. REWRITE and FIX the broken `.js` files in `public/tools/` for those specific failures.
5. `git add -A` and `git commit -m "fix: QA auto-fix for failed tools"`
6. `git push origin main`
7. REPEAT step 1. Do not stop looping through this QA -> Fix -> Push cycle until `qa_deep_test.js` reports ZERO failures.

Only stop when everything is 100% stable. Execute this continuous QA-fix loop immediately.