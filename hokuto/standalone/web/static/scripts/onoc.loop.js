"use strict"

/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

define([], function () {
    var subscribers = null;
    var subscribed = false;

    // The main animLoop method was taken and adapted from https://gist.github.com/louisremi/1114293#file-animloop_fixed-js
    function animLoop(render, element) {
        var running, lastFrame = +new Date;

        function loop(now) {
            // stop the loop if render returned false
            if (running !== false) {
                requestAnimationFrame(loop, element);
                var deltaT = now - lastFrame;
                // do not render frame when deltaT is too high
                if (deltaT < 160) {
                    running = render(deltaT);
                }
                lastFrame = now;
            }
        }
        loop(lastFrame);
    }

    // Public entry point; the provided function will be called once per frame
    // until it returns false
    function registerLoop(callback) {
        var newSub = {
            f: callback,
            n: subscribers
        };

        subscribers = newSub;

        if (!subscribed) {
            subscribed = true;

            animLoop(function (deltaT) {
                var pre = null;
                var current = subscribers;
                do {
                    if (current.f(deltaT) === false)
                        // Remove this callback
                        pre ? pre.n = current.n : subscribers = current.n;

                    pre = current;
                    current = current.n;
                } while (current);

                if (!subscribers) {
                    subscribed = false;
                    return false;
                }

                return true;
            });
        }
    }

    return registerLoop;
});
