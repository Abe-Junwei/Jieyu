"""Run with python3 scripts/check-ui-design-delivery.py; checks design artifacts only."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get('id'):
            self.ids.append(values['id'])
        if tag == 'a' and values.get('href', '').startswith('#'):
            self.anchors.append(values['href'][1:])


def main():
    folder = Path(__file__).resolve().parent.parent / ".superdesign"
    html = (folder / 'stitch-ui-engineering.latest.html').read_text()
    md = (folder / 'stitch-ui-engineering-addendum.md').read_text()
    illustrated = html.split('<section id="final-audit"', 1)[0]
    document = Document()
    document.feed(html)
    duplicate_ids = [key for key, count in Counter(document.ids).items() if count > 1]
    assert not duplicate_ids, duplicate_ids
    assert all(anchor in document.ids for anchor in document.anchors if anchor), document.anchors
    for filename in ('stitch-ui-engineering-addendum.md', 'design-final-audit.md'):
        assert (folder / filename).is_file(), filename
    for bad in ('Engineering Frozen Spec', '1440×900', 'Cmd+Shift+A', 'Esc 优先聚焦',
                'Esc 视为取消', 'isRequired: boolean', 'hasDirtyForm, onDismiss',
                '&lt;ModalPanel trapFocus', 'TimelineLaneDraftCell', '全部达标',
                'hero 36px', 'Fold: Cmd+'):
        assert bad not in illustrated, bad
    assert not re.search(r'text-\[(?:8|9|10|11)px\]', illustrated)
    assert not re.search(r'--state-(?:success|warning|danger|info)\s*:', illustrated)
    for expected in ('1440×1000', 'source-keyboard-contract', 'Ctrl+Enter', 'Cmd/Ctrl+J',
                     'Esc 最小化', '失焦回波形区', '完整性阻断', '--border-control',
                     '#7F8A9B', 'saveStatus', 'bubbleClick', '设计规定，不代表代码已实现或通过验收'):
        assert expected in html, expected
    for expected in ('音频层与混合层录音', '桌面项目生命周期', '导出与交换',
                     '清理与重置', '条件界面', 'Ctrl+Enter', 'closeDisabled不自动禁止',
                     '产品运行', 'HOLD'):
        assert expected in md, expected
    for token, value in {'surface-bg': '#EDF0F4', 'surface-panel': '#FFFFFF',
                         'text-secondary': '#5B6577', 'theme-accent-solid': '#7658F6'}.items():
        assert re.search(r'--' + token + r':\s*' + value + r';', html), token
    print('PASS: design HTML anchors, semantic checks, tokens, and supplemental coverage')
    print('Not tested: product runtime, persistence, desktop host, or complete accessibility')


if __name__ == '__main__':
    main()
