module.exports = {
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