#!/bin/bash

# Install BFG Repo Cleaner if needed
if ! command -v bfg &> /dev/null; then
    echo "BFG Repo Cleaner not found. Please install it:"
    echo "brew install bfg"
    exit 1
fi

# Create a backup
git clone --mirror .git backup.git

# Use BFG to remove large files
bfg --strip-blobs-bigger-than 50M backup.git

# Clean up and update
cd backup.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# Prepare to push the cleaned repo
echo ""
echo "Backup created and large files removed from the backup."
echo ""
echo "To complete the cleanup:"
echo "1. Push the cleaned repo with force:"
echo "   cd backup.git"
echo "   git push --force"
echo ""
echo "2. Clone a fresh copy of your repo"
echo "   cd .."
echo "   git clone https://github.com/Stockotaco/mythic-data-project.git mythic-data-clean"
echo ""
echo "3. Install Git LFS for future large files:"
echo "   git lfs install"
echo "" 