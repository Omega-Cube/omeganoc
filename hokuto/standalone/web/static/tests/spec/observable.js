/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
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
'use strict';

// Jasmine globals
/* global describe it expect jasmine */

define(['observable'], function(Observable) {
    describe('The simple observable implementation', function() {
        it('can be subscribed to', function() {
            var callback = function() {};
            var source = {};
            var eventName = 'someEvent';
            var obs = new Observable(source);

            obs.on(eventName, callback);

            expect(obs.observers[eventName]).toEqual([callback]);
        });

        it('can be triggered', function() {
            // Add two events
            var evt1cb1 = jasmine.createSpy('evt1Callback1');
            var evt1cb2 = jasmine.createSpy('evt1Callback2');
            var evt2cb1 = jasmine.createSpy('evt2Callback1');

            var evt1name = 'event1';
            var evt2name = 'event2';

            var source = {};
            var evtData = 'pepe';

            var obs = new Observable(source);

            obs.observers[evt1name] = [evt1cb1, evt1cb2];
            obs.observers[evt2name] = [evt2cb1];

            obs.trigger(evt1name, evtData);

            expect(evt1cb1).toHaveBeenCalledWith(evtData);
            expect(evt1cb2).toHaveBeenCalledWith(evtData);
            expect(evt2cb1).toHaveBeenCalledTimes(0);
        });

        it('stays cool when an unknown event is triggered', function() {
            var obs = new Observable();
            obs.trigger('jdjdjdjd', 'hi');

            // We didn't crash; just succeed now
            expect(true).toBe(true);
        });
    });
});