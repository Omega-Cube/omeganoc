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
        ]
    },
    "plugins": [
        "requirejs"
    ]
};