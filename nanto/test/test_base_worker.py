#!/usr/bin/python
# -*- coding: utf-8 -*-


# Copyright (C) 2014 Omega Cube
# This file is part of OmegaNoc's Prediction Module

"""This module tests the features available to all prediction systems"""

import os
import sys
import unittest

import rpy2.rinterface as ri
from rpy2.robjects.packages import importr

from omeganoc.predict.module.prediction_worker import PredictionWorker, PredictionValue

class TestBaseWorker(unittest.TestCase):
    """Unit testing the features bundled into the PredictionWorker base class"""
    def setUp(self):
        ri.initr()

    def r_value_is_NA(self, r_value):
        return r_value is ri.NA_Integer or r_value is ri.NA_Real or r_value is ri.NA_Logical or r_value is ri.NA_Character

    def assertListEqualsSexp(self, list, sexp, msg = None):
        i = 0
        mismatches = []
        while i < len(list):
            if list[i] != sexp[i] and not (list[i] is None and self.r_value_is_NA(sexp[i])):
                mismatches.append(i)
            i += 1

        if len(mismatches) > 0:
            if msg is None:
                msg = 'Provided list differs from the Sexp at these indexes: {0}.'.format(', '.join(['{0} ({1}/{2})'.format(i, list[i], sexp[i]) for i in mismatches]))
            self.fail(msg)

    def test_r_to_floats(self):
        test_list = [1, 2, 3, 5, 6, None]
        test_list_r = [1, 2, 3, 5, 6, ri.NARealType()]
        input = ri.FloatSexpVector(test_list_r)

        output = PredictionWorker._PredictionWorker__value_r_to_py(input, ri)

        self.assertListEqualsSexp(test_list, output)

    def test_floats_to_r(self):
        test_list = [1.0, 2.0, None, 5.0, 6.0, 7.0]
        input = PredictionValue('float', test_list)

        output = PredictionWorker._PredictionWorker__value_py_to_r(input, ri)

        self.assertListEqualsSexp(test_list, output)

    def test_float_to_r(self):
        test_data = 5
        input = PredictionValue('float', test_data)

        output = PredictionWorker._PredictionWorker__value_py_to_r(input, ri)

        self.assertListEqualsSexp([test_data], output)

    def test_generator_to_r(self):
        values = xrange(1, 10)
        input = PredictionValue('float', values)
        output = PredictionWorker._PredictionWorker__value_py_to_r(input, ri)

        self.assertListEqualsSexp([v for v in values], output)

    def test_str_to_r(self):
        data = 'hi'
        input = PredictionValue('string', data)
        output = PredictionWorker._PredictionWorker__value_py_to_r(input, ri)
        self.assertListEqualsSexp([data], output)

    def test_r_to_null(self):
        r_base = importr('base')
        r_base.eval(ri.parse('null_val <- c()'))
        result = PredictionWorker._PredictionWorker__value_r_to_py(ri.globalenv['null_val'], ri)
        self.assertIsNone(result)

    def test_r_simple_run(self):
        path = os.path.dirname(os.path.realpath(__file__))
        output = { 'output': None }
        PredictionWorker.run_r_script(os.path.join(path, 'double.r'), { 'input': PredictionValue('float', 7) }, output)
        self.assertListEqual([14], output['output'])

if __name__ == '__main__':
    unittest.main()
