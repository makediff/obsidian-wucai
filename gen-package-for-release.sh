rm -rf dist.zip
rm -rf dist/ && \
    npm i && \
    npm run dist

echo "all is done, " $(date)