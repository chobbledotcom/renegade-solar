{
  outputs =
    { self }:
    let
      pkgs = import <nixpkgs> { };

      devDependencies = with pkgs; [
        nodejs_24
        biome
      ];
    in
    {
      devShells.${pkgs.system} = {
        default = pkgs.mkShell {
          buildInputs = devDependencies;

          shellHook = ''
              [ ! -d node_modules ] && npm install

              cat <<EOF

              Development environment ready!

              Available commands:
               - 'npm run serve'   # Start development server
               - 'npm run build'   # Build the site in the _site directory
               - 'lint'            # Lint all files using Biome

              EOF

            git pull
          '';
        };
      };
    };
}