{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm.enable = true;
    npm.install.enable = true;
  };

  # .env holds the APIFY_API_TOKEN used by the social fetch scripts.
  dotenv.enable = true;

  packages = with pkgs; [
    biome
    git
  ];

  scripts.lint = {
    description = "Lint all files using Biome";
    exec = "biome check .";
  };

  # `devenv up` starts the dev server; `npm run serve` still works directly.
  processes.serve.exec = "npm run serve";

  enterShell = ''
    git pull
  '';
}
