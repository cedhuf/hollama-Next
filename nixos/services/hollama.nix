# services/hollama.nix
{ ... }:

{
  virtualisation.oci-containers.containers.hollama = {
    image = "ghcr.io/cedhuf/hollama:latest";
    extraOptions = [
      "--network=host"
      "--label=io.containers.autoupdate=registry"
      "--health-cmd=curl -s http://localhost:4173/ -o /dev/null || exit 1"
      "--health-interval=30s"
      "--health-timeout=5s"
      "--health-retries=3"
      "--health-start-period=20s"
    ];
  };
}
