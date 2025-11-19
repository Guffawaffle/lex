#!/bin/bash
set -euo pipefail

# Repository Hardening - Phase 1 Bootstrap
# This script sets up the foundation for secure development

echo "🔒 Lex Repository Hardening - Phase 1"
echo "======================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v git &> /dev/null; then
    echo "❌ git is not installed"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo "⚠️  GitHub CLI (gh) is not installed"
    echo "   Install from: https://cli.github.com/"
    echo "   Skipping branch protection setup"
    SKIP_BRANCH_PROTECTION=true
fi

if ! command -v gpg &> /dev/null; then
    echo "⚠️  GPG is not installed"
    echo "   Install GPG to enable commit signing"
    SKIP_GPG=true
fi

echo "✅ Prerequisites checked"
echo ""

# Initialize Changesets
echo "📦 Initializing Changesets..."
if [ ! -f ".changeset/config.json" ]; then
    npx @changesets/cli init
else
    echo "   Changesets already initialized"
fi
echo ""

# Set up commit signing (if GPG is available)
if [ -z "${SKIP_GPG:-}" ]; then
    echo "🔐 Setting up GPG commit signing..."

    # Check if user already has GPG configured
    if git config --global user.signingkey &> /dev/null; then
        echo "   GPG key already configured: $(git config --global user.signingkey)"
    else
        echo ""
        echo "No GPG key configured. To set up commit signing:"
        echo ""
        echo "1. Generate a GPG key:"
        echo "   gpg --full-generate-key"
        echo "   (Choose: RSA and RSA, 4096 bits, use your GitHub email)"
        echo ""
        echo "2. List your keys:"
        echo "   gpg --list-secret-keys --keyid-format=long"
        echo ""
        echo "3. Configure git:"
        echo "   git config --global user.signingkey YOUR_KEY_ID"
        echo "   git config --global commit.gpgsign true"
        echo "   git config --global tag.gpgsign true"
        echo ""
        echo "4. Add to GitHub:"
        echo "   gpg --armor --export YOUR_KEY_ID | gh gpg-key add -"
        echo ""
    fi
else
    echo "⚠️  Skipping GPG setup (not installed)"
fi
echo ""

# Set up branch protection (if gh is available)
if [ -z "${SKIP_BRANCH_PROTECTION:-}" ]; then
    echo "🛡️  Setting up branch protection..."

    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        echo "   Not authenticated with GitHub CLI"
        echo "   Run: gh auth login"
        echo "   Then re-run this script"
    else
        REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
        echo "   Repository: $REPO"

        # Check if branches exist
        if git rev-parse --verify main &> /dev/null; then
            echo "   Protecting main branch..."
            gh api "repos/$REPO/branches/main/protection" \
                --method PUT \
                --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
                --field required_status_checks='{"strict":true,"contexts":["all-checks-pass"]}' \
                --field enforce_admins=true \
                --field required_linear_history=true \
                --field required_signatures=true \
                --field allow_force_pushes=false \
                --field allow_deletions=false \
                2>/dev/null && echo "   ✅ main branch protected (1 approval required)" || echo "   ⚠️  Could not protect main (may need admin access)"
        else
            echo "   ⚠️  main branch does not exist yet"
        fi
    fi
else
    echo "⚠️  Skipping branch protection setup (gh not installed)"
fi
echo ""

# Enable security features
echo "🔒 Security configuration checklist:"
echo ""
echo "GitHub Settings to enable (requires admin access):"
echo "  □ Settings → Security → Dependency alerts → Enable Dependabot alerts"
echo "  □ Settings → Security → Dependency updates → Enable Dependabot security updates"
echo "  □ Settings → Security → Code security and analysis → Enable CodeQL"
echo "  □ Settings → Branches → Add rule for 'main'"
echo "     - Require signed commits"
echo "     - Require status checks (all-checks-pass)"
echo "     - Require linear history"
echo ""
echo "Secrets to add:"
echo "  □ Settings → Secrets → Actions → New repository secret"
echo "     - NPM_TOKEN (for publishing to npm)"
echo "     - CODECOV_TOKEN (for code coverage reporting)"
echo "     - SNYK_TOKEN (for security scanning, optional)"
echo ""

echo "✅ Phase 1 setup complete!"
echo ""
echo "Next steps:"
echo "  1. Review and commit the new configuration files"
echo "  2. Enable GitHub security features (see checklist above)"
echo "  3. Set up GPG signing for your commits"
echo "  4. Create a test changeset: npx changeset"
echo "  5. Run the CI workflow locally: npm run lint && npm test"
echo ""
echo "See REPO_HARDENING_PLAN.md for full implementation roadmap"
