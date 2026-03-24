import sys

with open('src/hooks/useAiAssistantHubContextValue.ts', 'r') as f:
    content = f.read()

# Find the function and replace it entirely
import re

new_func = '''export function pickAiAssistantHubContextValue(aiPanelContextValue: AiPanelContextValue): AiAssistantHubContextValue {
  // AiAssistantHubContextValue = Pick<AiPanelContextValue, K>，源对象结构上已满足条件 | AiAssistantHubContextValue is a structural Pick of AiPanelContextValue.
  return aiPanelContextValue as AiAssistantHubContextValue;
}'''

# Replace from 'export function pickAiAssistantHubContextValue' to the closing '}'
pattern = r'export function pickAiAssistantHubContextValue\(aiPanelContextValue: AiPanelContextValue\): AiAssistantHubContextValue \{.*?\n\}'
new_content = re.sub(pattern, new_func, content, flags=re.DOTALL, count=1)

if new_content == content:
    print("ERROR: pattern not found")
    sys.exit(1)

with open('src/hooks/useAiAssistantHubContextValue.ts', 'w') as f:
    f.write(new_content)

print("OK")
