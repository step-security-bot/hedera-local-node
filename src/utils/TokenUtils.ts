/*-
 *
 * Hedera Local Node
 *
 * Copyright (C) 2024 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import {
  AccountId,
  Client,
  CustomFee,
  PrivateKey,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenId,
  TokenMintTransaction,
  TokenSupplyType,
  TokenType,
  TransactionReceipt
} from '@hashgraph/sdk';
import { ITokenProps } from '../configuration/types/ITokenProps';
import { getPrivateKey } from '../configuration/types/IPrivateKey';

/**
 * Provides utility methods for working with tokens.
 */
export class TokenUtils {

  /**
   * Associates an account with the given tokens.
   * @param accountId The account ID to associate.
   * @param tokenIds The token IDs to associate.
   * @param accountKey The account key to sign the transaction.
   * @param client The client to use for associating the account with tokens.
   */
  public static async associateAccountWithTokens(accountId: AccountId,
                                                 tokenIds: TokenId[],
                                                 accountKey: PrivateKey,
                                                 client: Client): Promise<void> {
    const signTx = await new TokenAssociateTransaction()
      .setAccountId(accountId)
      .setTokenIds(tokenIds)
      .freezeWith(client)
      .sign(accountKey);

    const txResponse = await signTx.execute(client);
    await txResponse.getReceipt(client);
  }

  /**
   * Mints the given amount of tokens for the given token.
   * @param tokenId The token ID to mint.
   * @param metadata The metadata for the minted tokens.
   * @param supplyKey The supply key to sign the transaction.
   * @param client The client to use for minting the tokens.
   */
  public static async mintToken(tokenId: TokenId,
                                metadata: string,
                                supplyKey: PrivateKey,
                                client: Client): Promise<TransactionReceipt> {
    const transaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .setMetadata([Buffer.from(metadata)])
      .freezeWith(client);

    const signTx = await transaction.sign(supplyKey);
    const txResponse = await signTx.execute(client);
    return txResponse.getReceipt(client);
  }

  /**
   * Creates a token with the given properties.
   * @param token The properties of the token to create.
   * @param client The client to use for creating the token.
   */
  public static async createToken(token: ITokenProps, client: Client): Promise<TokenId> {
    const transaction = this.getTokenCreateTransaction(token);

    let signTx: TokenCreateTransaction;
    if (token.adminKey) {
      const adminKey = PrivateKey.fromStringECDSA(token.adminKey.value);
      transaction.freezeWith(client);
      signTx = await (await transaction.sign(adminKey)).signWithOperator(client);
    } else {
      transaction.freezeWith(client);
      signTx = await transaction.signWithOperator(client);
    }

    const txResponse = await signTx.execute(client);
    const receipt = await txResponse.getReceipt(client);

    return receipt.tokenId!;
  }

  /**
   * Returns the supply key for the given token.
   *
   * NOTE: The operator key will be used as a supply key by default,
   * if the supply key is not provided in the properties
   *
   * @param token The properties of the token.
   * @returns The supply key for the token.
   */
  public static getSupplyKey(token: ITokenProps): PrivateKey {
    // The operator key will be used as supply key if one is not provided
    if (token.supplyKey) {
      return getPrivateKey(token.supplyKey);
    }
    return PrivateKey.fromStringED25519(process.env.RELAY_OPERATOR_KEY_MAIN!);
  }

  /**
   * Returns the treasury account ID for the given token.
   *
   * NOTE: The operator ID will be used as a treasury account ID by default,
   * if the treasury key is not provided in the properties
   *
   * @param token The properties of the token.
   * @returns The treasury account ID for the token.
   */
  public static getTreasuryAccountId(token: ITokenProps): AccountId {
    // The operator key will be used as treasury key if one is not provided
    if (token.treasuryKey) {
      return getPrivateKey(token.treasuryKey).publicKey.toAccountId(0, 0);
    }
    return AccountId.fromString(process.env.RELAY_OPERATOR_ID_MAIN!);
  }

  /**
   * Creates a token create transaction with the given properties.
   * @param token The properties of the token to create.
   */
  private static getTokenCreateTransaction(token: ITokenProps): TokenCreateTransaction {
    const transaction = new TokenCreateTransaction();
    this.setRequiredProperties(transaction, token);
    this.setKeyProperties(transaction, token);
    this.setOptionalProperties(transaction, token);
    return transaction;
  }

  /**
   * Sets the required properties of the token create transaction.
   * @param transaction The transaction to set the properties on.
   * @param token The properties of the token to create.
   */
  private static setRequiredProperties(transaction: TokenCreateTransaction, token: ITokenProps): void {
    transaction.setTokenName(token.tokenName);
    transaction.setTokenSymbol(token.tokenSymbol);
    transaction.setTreasuryAccountId(this.getTreasuryAccountId(token));
    transaction.setSupplyKey(this.getSupplyKey(token));
    // If not provided, the TokenType is FUNGIBLE_COMMON by default
    if (token.tokenType === TokenType.NonFungibleUnique.toString()) {
      transaction.setTokenType(TokenType.NonFungibleUnique);
      transaction.setInitialSupply(0);
    } else {
      transaction.setTokenType(TokenType.FungibleCommon);
      transaction.setInitialSupply(token.initialSupply);
    }
    // If not provided, the TokenSupplyType is INFINITE by default
    if (token.supplyType === TokenSupplyType.Finite.toString()) {
      transaction.setSupplyType(TokenSupplyType.Finite);
    } else {
      transaction.setSupplyType(TokenSupplyType.Infinite);
    }
  }

  /**
   * Sets the key properties of the token create transaction.
   * @param transaction The transaction to set the properties on.
   * @param token The properties of the token to create.
   */
  private static setKeyProperties(transaction: TokenCreateTransaction, token: ITokenProps): void {
    if (token.adminKey) {
      transaction.setAdminKey(getPrivateKey(token.adminKey));
    }
    if (token.kycKey) {
      transaction.setKycKey(getPrivateKey(token.kycKey));
    }
    if (token.freezeKey) {
      transaction.setFreezeKey(getPrivateKey(token.freezeKey));
    }
    if (token.pauseKey) {
      transaction.setPauseKey(getPrivateKey(token.pauseKey));
    }
    if (token.wipeKey) {
      transaction.setWipeKey(getPrivateKey(token.wipeKey));
    }
    if (token.feeScheduleKey) {
      transaction.setFeeScheduleKey(getPrivateKey(token.feeScheduleKey));
    }
  }

  /**
   * Sets the optional properties of the token create transaction.
   * @param transaction The transaction to set the properties on.
   * @param token The properties of the token to create.
   */
  private static setOptionalProperties(transaction: TokenCreateTransaction, token: ITokenProps): void {
    if (token.maxSupply) {
      transaction.setMaxSupply(token.maxSupply);
    }
    if (token.decimals) {
      transaction.setDecimals(token.decimals);
    }
    if (token.freezeDefault) {
      transaction.setFreezeDefault(token.freezeDefault);
    }
    if (token.autoRenewAccountId) {
      transaction.setAutoRenewAccountId(token.autoRenewAccountId);
    }
    if (token.expirationTime) {
      transaction.setExpirationTime(new Date(token.expirationTime));
    }
    if (token.autoRenewPeriod) {
      transaction.setAutoRenewPeriod(token.autoRenewPeriod);
    }
    if (token.tokenMemo) {
      transaction.setTokenMemo(token.tokenMemo);
    }
    if (token.customFees) {
      // TODO: Test this
      transaction.setCustomFees(token.customFees.map(CustomFee._fromProtobuf));
    }
  }
}
