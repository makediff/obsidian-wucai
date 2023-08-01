rm -rf obsidian-wucai.zip
rm -rf dist.zip
rm -rf dist/ && \
    npm run dist

echo "all is done, " $(date)