import sys

path = 'src/navigation/RootNavigator.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the line that contains name="AISuggestions" and get the closing /> line after it
target_idx = None
for i, line in enumerate(lines):
    if 'name="AISuggestions"' in line:
        # Find the next closing />
        for j in range(i, min(i+5, len(lines))):
            if '/>' in lines[j]:
                target_idx = j
                break
        break

if target_idx is None:
    print("ERROR: Could not find AISuggestions block")
    sys.exit(1)

print(f"Found AISuggestions closing at line {target_idx+1}: {lines[target_idx].rstrip()}")

# Check if TeamInvitations already inserted
already = any('TeamInvitations' in l and 'Stack.Screen' not in l.replace('component={TeamInvitationsScreen}','') for l in lines)
already_screen = any('name="TeamInvitations"' in l for l in lines)
if already_screen:
    print("TeamInvitations Stack.Screen already exists!")
    sys.exit(0)

insert = [
    '            <Stack.Screen\r\n',
    '              name="TeamInvitations"\r\n',
    '              component={TeamInvitationsScreen}\r\n',
    '              options={{ animationEnabled: true }}\r\n',
    '            />\r\n',
]

new_lines = lines[:target_idx+1] + insert + lines[target_idx+1:]
with open(path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Done. Inserted TeamInvitations after line {target_idx+1}. Total lines: {len(new_lines)}")
