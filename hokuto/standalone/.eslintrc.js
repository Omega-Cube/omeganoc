module.exports = {
    "root": true, // Added to avoid loading configurations located in the project containing folder
    "env": {
        "browser": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:requirejs/recommended"
    ],
    "rules": {
        "indent": [
            "error",
            4
        ],
        "linebreak-style": [
            "error",
            "unix"
        ],
        "quotes": [
            "error",
            "single"
        ],
        "semi": [
            "error",
            "always"
        ],
        "strict": [
            "error",
            "global"
        ],
        "no-eval": [ "error" ],
        "no-empty-function": [ "warn" ],
        "no-eq-null": [ "error" ],
        "eqeqeq": [ "error" ],
        "no-extend-native": [ "error" ],
        "no-global-assign": [ "error" ],
        "no-implicit-globals": [ "error" ],
        "no-implied-eval": [ "error" ],
        "no-iterator": [ "error" ],
        "no-labels": [ "error" ],
        "no-lone-blocks": [ "error" ],
        // "no-magic-numbers": [ "warn" ], // One day, hopefully, we can get time to solve that problem
        "no-multi-spaces": [ "warn" ],
        "no-new-func": [ "error" ],
        "no-new-wrappers": [ "error" ],
        // "no-new": [ "warn" ], // TODO: Uncomment and fix
        "no-octal": [ "error" ],
        "no-proto": [ "error" ],
        "no-return-assign": [ "error" ],
        "no-script-url": [ "error" ],
        "no-self-compare": [ "warn" ],
        "no-throw-literal": [ "error" ],
        "no-unmodified-loop-condition": [ "warn" ],
        "no-unused-expressions": [ "warn" ],
        "no-useless-call": [ "warn" ],
        "no-useless-concat": [ "warn" ],
        "no-void": [ "error" ],
        "no-warning-comments": [ "warn" ],
        "no-with": [ "error" ],
        "radix": [ "error" ],
        "no-catch-shadow": [ "error" ],
        "no-shadow-restricted-names": [ "error" ],
        "no-shadow": [ "error" ],
        "no-use-before-define": [ "error" ],
    },
    "plugins": [
        "requirejs"
    ]
};