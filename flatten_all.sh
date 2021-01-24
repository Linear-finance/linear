#!/bin/bash

rm -rf ./flat

find ./contracts -type f -exec sh -c 'mkdir -p ./flat/$(dirname {}) && yarn run --silent hardhat flatten {} > ./flat/{}' \;

find ./flat/contracts -type f -exec sed -i 's/\/\/ SPDX-License-Identifier:.*//g' {} \;
find ./flat/contracts -type f -exec sed -i 's/\/\/ Sources flattened with.*//g' {} \;

find ./flat/contracts -type f -exec sh -c 'echo "// SPDX-License-Identifier: MIT" > {}.tmp && cat {} >> {}.tmp && mv {}.tmp {}' \;

yarn prettier --write ./flat
