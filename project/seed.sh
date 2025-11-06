#!/bin/bash
set -euo pipefail

# Lex OSS Roadmap Project Seeder
# Detects both project numbers, bulk-adds Lex OSS issues, prints status

echo "🔍 Detecting GitHub Projects..."
echo ""

# Detect project numbers
PRIVATE_PROJECT=$(gh project list --owner Guffawaffle --format json | jq -r '.projects[] | select(.title == "lex-pr-runner") | .number')
PUBLIC_PROJECT=$(gh project list --owner Guffawaffle --format json | jq -r '.projects[] | select(.title == "Lex OSS Roadmap") | .number')

if [ -z "$PRIVATE_PROJECT" ]; then
  echo "❌ Could not find 'lex-pr-runner' project"
  exit 1
fi

if [ -z "$PUBLIC_PROJECT" ]; then
  echo "❌ Could not find 'Lex OSS Roadmap' project"
  exit 1
fi

echo "✅ Found projects:"
echo "   Private (LexRunner ↔ Lex): Project #$PRIVATE_PROJECT"
echo "   Public (Lex OSS Roadmap):  Project #$PUBLIC_PROJECT"
echo ""

# Add project:lex-oss label and add to public board
echo "📦 Adding OSS-friendly issues to public board..."
echo ""

ORG=Guffawaffle
REPO=lex

# Safe public issues (docs/tests/memory that don't leak runner internals)
OSS_ISSUES=(80 83 84)

for n in "${OSS_ISSUES[@]}"; do
  echo "  → Issue #$n"

  # Add project:lex-oss label (also keeps project:lexrunner-lex)
  gh issue edit $n --repo $ORG/$REPO --add-label "project:lex-oss" 2>&1 | head -1

  # Add to public project
  gh project item-add $PUBLIC_PROJECT --owner $ORG \
    --url "https://github.com/$ORG/$REPO/issues/$n" 2>&1 | grep -E "(Added|already)" | head -1
done

echo ""
echo "✅ Seed complete!"
echo ""

# Status summary
echo "📊 One-page status:"
echo ""
echo "**Projects**:"
echo "  - Private (#$PRIVATE_PROJECT): https://github.com/users/$ORG/projects/$PRIVATE_PROJECT"
echo "  - Public (#$PUBLIC_PROJECT):  https://github.com/users/$ORG/projects/$PUBLIC_PROJECT"
echo ""

PRIVATE_COUNT=$(gh project view $PRIVATE_PROJECT --owner $ORG --format json | jq '.items.totalCount')
PUBLIC_COUNT=$(gh project view $PUBLIC_PROJECT --owner $ORG --format json | jq '.items.totalCount')

echo "**Item counts**:"
echo "  - Private board: $PRIVATE_COUNT issues"
echo "  - Public board:  $PUBLIC_COUNT issues"
echo ""

echo "**Working rules** (reminder):"
echo "  - Runner issues: label 'project:lexrunner-lex' only (private)"
echo "  - Lex public:    label 'project:lexrunner-lex' + 'project:lex-oss'"
echo "  - Lex sensitive: label 'project:lexrunner-lex' + 'internal-only' (private only)"
echo ""

echo "**Next steps**:"
echo "  1. Review https://github.com/users/$ORG/projects/$PUBLIC_PROJECT"
echo "  2. Add custom fields: Type, Area, Milestone (via project settings)"
echo "  3. Consider adding #79, #81, #82 if safe for public view"
echo "  4. Push workflow updates: cd lex && git push"
echo ""

echo "🎉 Done!"
