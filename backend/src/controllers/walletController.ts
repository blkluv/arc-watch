import { Request, Response } from 'express';
import * as walletService from '../services/walletService';
// Use require() for CommonJS compatibility with our pricing module
const pricing = require('../utils/pricing');

const getStringParam = (param: string | string[] | undefined): string => {
  if (typeof param === 'string') return param;
  if (Array.isArray(param)) return param[0];
  return '';
};

export const createWallet = async (req: Request, res: Response) => {
  try {
    const { userId, userEmail } = req.body;
    if (!userId || !userEmail) {
      return res.status(400).json({ error: 'userId and userEmail required' });
    }
    const result = await walletService.createUserWallet(userId, userEmail);
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

export const getBalance = async (req: Request, res: Response) => {
  try {
    const address = getStringParam(req.params.address);
    if (!address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    const result = await walletService.getUSDCBalance(address);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

export const getDepositInfo = (req: Request, res: Response) => {
  try {
    const address = getStringParam(req.params.address);
    if (!address) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    const result = walletService.getDepositAddress(address);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

export const validateSession = async (req: Request, res: Response) => {
  try {
    const { walletAddress, podcastDurationSeconds, pricePerMinuteUSD } = req.body;
    if (!walletAddress || !podcastDurationSeconds) {
      return res.status(400).json({ error: 'walletAddress and podcastDurationSeconds required' });
    }
    
    const balanceResult = await walletService.getUSDCBalance(walletAddress);
    if (!balanceResult.success) {
      return res.status(500).json(balanceResult);
    }
    
    const config = {
      ...pricing.DEFAULT_CONFIG,
      pricePerMinuteUSD: pricePerMinuteUSD || pricing.DEFAULT_CONFIG.pricePerMinuteUSD
    };
    
    const validation = pricing.validateBalance(
      balanceResult.balanceUSDC,
      podcastDurationSeconds,
      config
    );
    
    const pricingDetails = pricing.calculateSegmentPricing(podcastDurationSeconds, config);
    
    res.json({
      walletAddress,
      balance: balanceResult.balanceUSDC,
      validation,
      pricing: pricingDetails,
      hackathonCompliant: pricing.meetsHackathonRequirements(config)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

module.exports = { createWallet, getBalance, getDepositInfo, validateSession };
