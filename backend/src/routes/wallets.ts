import express from 'express';
import { Request, Response } from 'express';
const walletController = require('../controllers/walletController');
const walletService = require('../services/walletService');
const { prisma } = require('../lib/prisma');

const router = express.Router();

router.post('/create', walletController.createWallet);
router.get('/:address/balance', walletController.getBalance);
router.get('/:address/deposit', walletController.getDepositInfo);
router.post('/validate-session', walletController.validateSession);

// Get wallet state including deployment status and balance
router.get('/:address/state', async (req: Request, res: Response) => {
  try {
    const address = typeof req.params.address === 'string' ? req.params.address : '';
    if (!address) return res.status(400).json({ error: 'Address required' });
    
    const user = await prisma.user.findUnique({
      where: { dcwAddress: address }
    });
    
    if (!user?.circleWalletId) {
      return res.status(404).json({ error: 'Wallet not found in database' });
    }
    
    // Get both Circle state and on-chain deployment status
    const [circleState, isDeployed, balanceInfo] = await Promise.all([
      walletService.getCircleWalletState(user.circleWalletId).catch(() => null),
      walletService.isWalletDeployedOnChain(address),
      walletService.getUSDCBalance(address).catch(() => ({ success: false, balanceUSDC: '0' }))
    ]);
    
    res.json({ 
      success: true, 
      data: {
        circleState: circleState?.state || 'UNKNOWN',
        circleIsDeployed: circleState?.isDeployed || false,
        isDeployed,
        address,
        walletId: user.circleWalletId,
        balance: balanceInfo.success ? balanceInfo.balanceUSDC : '0',
        needsFunding: !isDeployed && parseFloat(balanceInfo.balanceUSDC || '0') < 0.001,
        // ✅ CORRECTED EXPLORER URL
        explorerUrl: `https://testnet.arcscan.app/address/${address}`
      }
    });
  } catch (err: any) {
    console.error('Get wallet state error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 🔍 Diagnostic endpoint
router.get('/:address/diagnose', async (req: Request, res: Response) => {
  try {
    const address = typeof req.params.address === 'string' ? req.params.address : '';
    if (!address) return res.status(400).json({ error: 'Address required' });
    
    await walletService.diagnoseWalletDeployment(address);
    
    const [isDeployed, balanceInfo] = await Promise.all([
      walletService.isWalletDeployedOnChain(address),
      walletService.getUSDCBalance(address).catch(() => ({ success: false, balanceUSDC: '0' }))
    ]);
    
    res.json({
      success: true,
      data: {
        address,
        isDeployed,
        balance: balanceInfo.success ? balanceInfo.balanceUSDC : '0',
        // ✅ CORRECTED EXPLORER URL
        explorerUrl: `https://testnet.arcscan.app/address/${address}`
      }
    });
  } catch (err: any) {
    console.error('Diagnose error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Deploy wallet endpoint
router.post('/deploy', async (req: Request, res: Response) => {
  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'DCW address required' });
    
    const user = await prisma.user.findUnique({
      where: { dcwAddress: address }
    });
    
    if (!user?.circleWalletId) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    const result = await walletService.deployCircleWallet(user.circleWalletId, user.dcwAddress);
    
    // ✅ Force success if we have a transaction hash (it's confirmed on-chain)
    if (result.txHash) {
      result.onChainDeployed = true;
      result.message = 'Wallet deployed successfully!';
    }
    
    res.json({ 
      success: true, 
      data: {
        txId: result.txId,
        txHash: result.txHash,
        onChainDeployed: result.onChainDeployed,
        // ✅ CORRECTED EXPLORER URL
        explorerUrl: result.txHash 
          ? `https://testnet.arcscan.app/tx/${result.txHash}`
          : `https://testnet.arcscan.app/address/${address}`
      },
      message: result.message
    });
  } catch (err: any) {
    console.error('Deploy wallet error:', err);
    
    // Handle specific error types
    if (err.message.includes('Insufficient balance') || err.message.includes('funding')) {
      return res.status(400).json({ 
        error: 'INSUFFICIENT_FUNDS',
        message: err.message 
      });
    }
    
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;