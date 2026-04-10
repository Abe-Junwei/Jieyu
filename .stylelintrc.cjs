module.exports = {
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  rules: {
    'declaration-property-value-disallowed-list': {
      transition: [/^all(?:\s|$)/],
    },
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'no-empty-source': true,
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-values'] }],
    'font-family-no-duplicate-names': true,
    'selector-pseudo-element-colon-notation': 'double',
  },
};
