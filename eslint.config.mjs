import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.history/**",
      "**/.vscode-test/**",
      "**/dist/**",
      "**/icons/**",
      "**/assets/**",
      "**/tmp-lmdb/**",
    ],
  },
  {
    files: ["src/**/*.js", "scripts/**/*.js"],
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: "commonjs",
        globals: {
            ...globals.commonjs,
            ...globals.node,
            ...globals.mocha,
        },
    },
    rules: {
        // Core correctness
        "no-const-assign": "error",
        "no-this-before-super": "error",
        "no-undef": "error",
        "no-unreachable": "warn",
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
        "constructor-super": "error",
        "valid-typeof": "error",

        // Node/JS community style preferences
        "eqeqeq": ["warn", "smart"],
        "curly": ["warn", "all"],
        "no-var": "warn",
        "prefer-const": ["warn", { destructuring: "all" }],
        "prefer-template": "warn",
        "object-shorthand": ["warn", "properties"],
        "arrow-body-style": ["warn", "as-needed"],

        // Allow console as this is a VS Code extension with custom logger
        "no-console": "off",
    },
}
];