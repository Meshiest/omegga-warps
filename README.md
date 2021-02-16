# warps plugin

A warps plugin for [omegga](https://github.com/brickadia-community/omegga) allowing players to warp to predefined locations and optionally set homes.

## Install

Easy: `omegga install gh:Meshiest/warps`

Manual:

* `git clone https://github.com/meshiest/omegga-warps warps` in `plugins` directory

## Commands

* `/setwarp <name>` - (authorized only) define a warp destination
* `/delwarp <name>` - (authorized only) delete an existing warp destination
* `/clearwarps` - (authorized only) clear all warp data (homes and warps)
* `/warp <name>` - warp to a defined warp
* `/warps` - list available warps
* `/home [user]` - teleport home, authorized users can teleport to other player's homes
* `/sethome` - specify home destination

## Configs

* `only-authorized` - Whether only authorized players can use warp management commands
* `authorized-users` - List of players who can always use warp management commands
* `warp-enabled` - Whether non-authorized users can warp and list warps
* `home-enabled` - Whether non-authorized users can set/use a home warp
* `warp-cooldown` - Seconds between warps/homes for non-authorized users
