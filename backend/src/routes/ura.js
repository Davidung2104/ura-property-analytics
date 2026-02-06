import express from 'express';
import * as uraService from '../services/uraService.js';

const router = express.Router();

/**
 * GET /api/stats
 * Get batch statistics and data health
 */
router.get('/stats', (req, res) => {
  const stats = uraService.getBatchStats();
  res.json({
    success: true,
    data: stats
  });
});

/**
 * GET /api/transactions
 * Get all transactions with optional filters
 */
router.get('/transactions', async (req, res, next) => {
  try {
    const { district, propertyType } = req.query;
    const transactions = await uraService.getTransactions({ district, propertyType });
    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/districts/summary
 * Get district-wise price summary for comparison
 */
router.get('/districts/summary', async (req, res, next) => {
  try {
    const summary = await uraService.getDistrictSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/property-types/summary
 * Get property type breakdown
 */
router.get('/property-types/summary', async (req, res, next) => {
  try {
    const summary = await uraService.getPropertyTypeSummary();
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/projects/search
 * Search projects by name with filters
 */
router.get('/projects/search', async (req, res, next) => {
  try {
    const { q, district, propertyType, minPrice, maxPrice } = req.query;
    const results = await uraService.searchProjects(q, {
      district,
      propertyType,
      minPrice,
      maxPrice
    });
    res.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/filters
 * Get available filter options
 */
router.get('/filters', async (req, res, next) => {
  try {
    const options = await uraService.getFilterOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/refresh
 * Force refresh cache
 */
router.post('/refresh', async (req, res, next) => {
  try {
    await uraService.getTransactionData(true);
    res.json({
      success: true,
      message: 'Cache refreshed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/refresh-token
 * Manually refresh URA token
 */
router.post('/refresh-token', async (req, res, next) => {
  try {
    const result = await uraService.refreshToken();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
