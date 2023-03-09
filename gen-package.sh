
newdist=obsidian-wucai
rm -rf $newdist && mkdir $newdist
npm run dist && cp -rf dist/* $newdist