{
  pkgs ? import <nixpkgs> { },
}:

let
  packageJSON = pkgs.writeTextFile {
    name = "package.json";
    text = builtins.toJSON {
      name = "renegade-solar-co-uk";
      version = "1.0.1";
      dependencies = {
        "@11ty/eleventy" = "^3.0.0";
        "@11ty/eleventy-img" = "^6.0.0";
        "fast-glob" = "^3.3.2";
      };
    };
  };

  nodeModules = pkgs.mkYarnModules {
    pname = "renegade-solar-co-uk-deps";
    version = "1.0.0";
    packageJSON = packageJSON;
    yarnLock = ./yarn.lock;
    yarnFlags = [ "--frozen-lockfile" ];
  };
in
{
  inherit packageJSON nodeModules;
}
