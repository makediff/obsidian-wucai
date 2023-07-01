echo "prepare package" $(date)

bash ./gen-package-for-release.sh

distdir=~/data/testWuCaiOb/.obsidian/plugins/wucai-highlights-official
cp -rf ./dist/* $distdir

ls -lth $distdir

echo "all is done" $(date)