const badRegex = /\\u7ffb\\u8bd1/;
const goodRegex = /\u7ffb\u8bd1/;
const chinese = '翻译';
const slashU = '\\u7ffb\\u8bd1';

console.log('badRegex_vs_chinese\t' + badRegex.test(chinese));
console.log('badRegex_vs_slashU\t' + badRegex.test(slashU));
console.log('goodRegex_vs_chinese\t' + goodRegex.test(chinese));
console.log('goodRegex_vs_slashU\t' + goodRegex.test(slashU));

const badStr = '\\u7ffb\\u8bd1';
const goodStr = '\u7ffb\u8bd1';
console.log('badStr_literal\t' + badStr);
console.log('goodStr_literal\t' + goodStr);
