#!/bin/bash

PRAGMA_ABI_V2="pragma experimental ABIEncoderV2;"

readarray -d '' CONTRACT_FILES < <(find ./contracts/ -name "*.sol" -print0)

rm -rf ./dist/*

for CONTRACT_FILE in "${CONTRACT_FILES[@]}"
do
  BASE_PATH="$(echo $(dirname $CONTRACT_FILE) | cut -c13-)/"
  if [ "$BASE_PATH" = "/" ]; then
    BASE_PATH=""
  fi

  CONTRACT_NAME="$(basename $CONTRACT_FILE .sol)"
  DIST_SRC_DIR="./dist/sources/$BASE_PATH"
  DIST_BIN_DIR="./dist/bins/$BASE_PATH"
  DIST_ABI_DIR="./dist/abis/$BASE_PATH"

  mkdir -p $DIST_SRC_DIR
  mkdir -p $DIST_BIN_DIR
  mkdir -p $DIST_ABI_DIR

  echo "Flattening contract $CONTRACT_NAME.sol"
  yarn run -s hardhat flatten $CONTRACT_FILE > $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp

  echo "// SPDX-License-Identifier: MIT" > $DIST_SRC_DIR$CONTRACT_NAME.sol

  USES_ABI_V2=$(cat $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp | grep "$PRAGMA_ABI_V2");
  if [ -n "$USES_ABI_V2" ]; then
    echo "$PRAGMA_ABI_V2" >> $DIST_SRC_DIR$CONTRACT_NAME.sol
    sed -i "s/$PRAGMA_ABI_V2//g" $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp
  fi

  sed -i 's/\/\/ SPDX-License-Identifier:.*//g' $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp
  sed -i 's/\/\/ Sources flattened with.*//g' $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp
  cat $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp >> $DIST_SRC_DIR$CONTRACT_NAME.sol
  rm $DIST_SRC_DIR$CONTRACT_NAME.sol.tmp

  yarn run -s prettier --write $DIST_SRC_DIR$CONTRACT_NAME.sol

  # Wrap sol into JSON
  cat $DIST_SRC_DIR$CONTRACT_NAME.sol | jq -Rs . > $DIST_SRC_DIR$CONTRACT_NAME.json
  rm $DIST_SRC_DIR$CONTRACT_NAME.sol

  cat ./artifacts/$CONTRACT_FILE/$CONTRACT_NAME.json | jq '{bytecode: .bytecode, linkReferences: .linkReferences}' > $DIST_BIN_DIR$CONTRACT_NAME.json
  cat ./artifacts/$CONTRACT_FILE/$CONTRACT_NAME.json | jq '.abi' > $DIST_ABI_DIR$CONTRACT_NAME.json
done
