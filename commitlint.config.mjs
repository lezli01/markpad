/**
 * Matches the config-conventional fallback the commit-lint workflow used before
 * this file existed, with one exception: Dependabot's commits are skipped.
 *
 * Dependabot puts the full `.../compare/<sha>...<sha>` URL in the commit body,
 * which is always longer than the 100 column body limit, so every one of its
 * pull requests failed the required check on a line no human wrote.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => /^Signed-off-by: dependabot\[bot\]/m.test(message)],
};
