from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.models import models


class TrustService:
    """
    TRUST SCORE SYSTEM
    ==================
    Starting score: 25 (behavior_trust=25, everything else=0)
    Maximum score:  75

    Identity Trust breakdown (max 50, ALL need admin approval):
      +5  Professional (role + bio + portfolio URL)
      +5  Past Project URL
      +5  Emergency Contact (name + relationship + EC ID photo)
      +10 Emergency Contact (phone + email)
      +25 KYC Identity Verification (ID photo + selfie approved by admin)
      ─────────────────────────────
      =50 Max identity_trust

    Behavior Trust: starts at 25, max 25, affected by penalties/boosts
    Financial Trust: starts at 0, max 0 (reserved for future repayment tracking)

    Grand Total: 25 (start) + 50 (identity) = 75 max
    """

    @staticmethod
    def update_overall_score(user: models.User):
        """Recalculates trust_score and trust_tier from the three pillars."""
        user.trust_score = (
            (user.identity_trust or 0) +   # 0-50
            (user.behavior_trust or 0) +    # 0-25, starts at 25
            (user.financial_trust or 0)     # 0-0 (not used yet)
        )
        # Tiers
        if user.trust_score >= 80:
            user.trust_tier = 2   # Gold
        elif user.trust_score >= 50:
            user.trust_tier = 1   # Silver
        else:
            user.trust_tier = 0   # Bronze

    @staticmethod
    def _recalculate_total(user):
        TrustService.update_overall_score(user)

    # ── IDENTITY TRUST ────────────────────────────────────────────────────────

    @staticmethod
    def apply_profile_update_boost(db: Session, user: models.User):
        """
        Recalculates identity_trust based on approved_sections.
        approved_sections keys and their point values:
          professional  → +5  (filmmaker_role or bio or portfolio_url)
          past_project  → +5  (past_project_url)
          ec_name       → +5  (emergency_contact_name + relationship)
          ec_contact    → +5  (emergency_contact_phone + email)
          ec_id         → +5  (emergency_contact_id_url)
          kyc           → +25 (id_photo_url + selfie_photo_url + is_verified)
        Total max: 50
        """
        approved = getattr(user, 'approved_sections', None) or {}

        identity_points = 0

        # +5 Professional block
        if approved.get('professional') and (user.filmmaker_role or user.bio or user.portfolio_url):
            identity_points += 5

        # +5 Past Project
        if approved.get('past_project') and user.past_project_url:
            identity_points += 5

        # +5 Emergency Contact: Name + Relationship
        if approved.get('ec_name') and user.emergency_contact_name and user.emergency_contact_relationship:
            identity_points += 5

        # +5 Emergency Contact: Phone + Email
        if approved.get('ec_contact') and user.emergency_contact_phone and user.emergency_contact_email:
            identity_points += 5

        # +5 Emergency Contact: EC ID photo
        ec_id_url = getattr(user, 'emergency_contact_id_url', None)
        if approved.get('ec_id') and ec_id_url:
            identity_points += 5

        # +25 KYC — must be explicitly approved AND both photos present AND is_verified
        if approved.get('kyc') and user.id_photo_url and user.selfie_photo_url and user.is_verified:
            identity_points += 25

        user.identity_trust = identity_points
        TrustService.update_overall_score(user)

    @staticmethod
    def apply_identity_boost(db: Session, user: models.User):
        """No auto-boost on upload — admin approval required."""
        pass

    # ── BEHAVIOR TRUST ────────────────────────────────────────────────────────

    @staticmethod
    def apply_behavior_penalty(db: Session, user: models.User, penalty: int = 2):
        """Penalty for wrong PIN, security violations, etc."""
        user.behavior_trust = max((user.behavior_trust or 0) - penalty, 0)
        TrustService.update_overall_score(user)

    @staticmethod
    def apply_behavior_boost(db: Session, user: models.User):
        """Reward for security stability."""
        user.behavior_trust = min((user.behavior_trust or 0) + 1, 25)
        TrustService.update_overall_score(user)

    @staticmethod
    def apply_time_decay(db: Session, user: models.User):
        """Reduces Behavior Trust for 3+ months of inactivity."""
        if not user.last_login_at:
            return
        now = datetime.now(timezone.utc)
        last_login = user.last_login_at
        if last_login.tzinfo is None:
            last_login = last_login.replace(tzinfo=timezone.utc)
        months_inactive = (now - last_login).days // 30
        if months_inactive >= 3:
            penalty = (months_inactive // 3) * 5
            if penalty > 0:
                old_score = user.trust_score
                user.behavior_trust = max(
                    0, (user.behavior_trust or 0) - penalty)
                TrustService.update_overall_score(user)
                if user.trust_score < old_score:
                    notif = models.Notification(
                        user_id=user.id,
                        title="Trust Score Adjusted",
                        message=f"Score decreased by {old_score - user.trust_score} pts due to inactivity."
                    )
                    db.add(notif)

    # ── FINANCIAL TRUST ───────────────────────────────────────────────────────

    @staticmethod
    def apply_repayment_reward(db: Session, user: models.User):
        """On-time payment: +1 financial trust."""
        user.financial_trust = min((user.financial_trust or 0) + 1, 25)
        TrustService.update_overall_score(user)

    @staticmethod
    def apply_early_repayment_reward(db: Session, user: models.User, days_early: int = 0):
        """Early payment bonus."""
        bonus = 3 if days_early >= 7 else 2 if days_early >= 1 else 1
        user.financial_trust = min((user.financial_trust or 0) + bonus, 25)
        TrustService.update_overall_score(user)
        if days_early >= 1 and db:
            db.add(models.Notification(
                user_id=user.id,
                title="Early Repayment Bonus! 🌟",
                message=f"You paid {days_early} days early and earned +{bonus} trust points!"
            ))

    @staticmethod
    def apply_late_penalty(db: Session, user: models.User):
        """Missed payment: -15 financial trust."""
        user.financial_trust = max((user.financial_trust or 0) - 15, 0)
        TrustService.update_overall_score(user)

    # ── ADVANCE PAYMENT ───────────────────────────────────────────────────────

    @staticmethod
    def apply_advance_payment_reward(db: Session, user: models.User, loan: models.Loan):
        """
        Any advance: +2 behavior pts.
        Every 3 consecutive advances: +5 extra pts + lock 10% rate.
        Streak breaks (pay on-time not early): rate back to 15%, no pts deduction.
        """
        loan.advance_payment_streak = (loan.advance_payment_streak or 0) + 1
        loan.total_advance_payments = (loan.total_advance_payments or 0) + 1
        pts = 2
        if loan.advance_payment_streak % 3 == 0:
            pts += 5
            if float(loan.interest_rate) > 0.10:
                loan.interest_rate = 0.10
        user.behavior_trust = min(25, (user.behavior_trust or 0) + pts)
        TrustService.update_overall_score(user)
        db.flush()

    @staticmethod
    def revert_advance_rate(loan: models.Loan):
        """Streak broken — reset streak, revert rate if not yet earned."""
        loan.advance_payment_streak = 0
        if (loan.total_advance_payments or 0) < 3 and float(loan.interest_rate) == 0.10:
            loan.interest_rate = 0.15

    # ── GRACE FAILURE ─────────────────────────────────────────────────────────

    @staticmethod
    def apply_grace_failure_penalty(db: Session, user: models.User):
        """-10 behavior trust for missing a monthly grace update."""
        user.behavior_trust = max(0, (user.behavior_trust or 0) - 10)
        TrustService.update_overall_score(user)
        db.flush()

    # ── DELAY FAILURE PENALTY ─────────────────────────────────────────────────

    @staticmethod
    def apply_delay_failure_penalty(db: Session, user: models.User, loan):
        """
        User failed to request a delay within the 3-day grace window
        and didn't pay on time.
        Penalty: +5% interest on remaining balance, -10 behavior trust.
        Only applied once per overdue installment (tracked by is_overdue flag).
        """
        from decimal import Decimal as D
        # +5% interest penalty on remaining balance
        penalty_amount = (loan.remaining_amount or D("0")) * D("0.05")
        loan.remaining_amount = (
            loan.remaining_amount or D("0")) + penalty_amount
        loan.total_penalty_paid = (
            loan.total_penalty_paid or D("0")) + penalty_amount
        # -10 behavior trust
        user.behavior_trust = max(0, (user.behavior_trust or 0) - 10)
        TrustService.update_overall_score(user)
        db.flush()

    # ── DELAY / MONTHLY-UPDATE RULE ENGINE ───────────────────────────────────
    # These implement the specific point values from the delay/monthly-update
    # policy and are intentionally separate from the generic penalties above
    # so existing call sites are not affected.

    @staticmethod
    def apply_monthly_update_warning_penalty(db: Session, user: models.User):
        """
        -2 trust points: producer used their monthly-update attempt on the
        final day of the 3-day warning window (cutting it as close as
        possible, but still technically on time).
        """
        user.behavior_trust = max(0, (user.behavior_trust or 0) - 2)
        TrustService.update_overall_score(user)
        db.flush()

    @staticmethod
    def apply_delay_warning_penalty(db: Session, user: models.User):
        """
        -5 trust points: producer only submitted their delay request on the
        last day of the 3-day warning window.
        """
        user.behavior_trust = max(0, (user.behavior_trust or 0) - 5)
        TrustService.update_overall_score(user)
        db.flush()

    @staticmethod
    def apply_no_warning_response_penalty(db: Session, user: models.User):
        """
        -2 trust points: applied every 3 days an overdue installment remains
        unresolved after its warning window has fully elapsed, with no delay
        or monthly-update request submitted at all.
        """
        user.behavior_trust = max(0, (user.behavior_trust or 0) - 2)
        TrustService.update_overall_score(user)
        db.flush()

    @staticmethod
    def apply_grace_period_completion_bonus(db: Session, user: models.User):
        """
        +5 trust points: producer successfully used the full 3-month
        Development/Pre-Production grace window (an approved monthly update
        every month, no missed updates) without needing to pay.
        """
        user.behavior_trust = min(25, (user.behavior_trust or 0) + 5)
        TrustService.update_overall_score(user)
        db.flush()

    @staticmethod
    def apply_monthly_update_success_bonus(db: Session, user: models.User):
        """
        +2 trust points: any approved monthly update outside of the grace
        window (normal phases, or Development/Pre-Production after their
        3-month grace period has already been used up).
        """
        user.behavior_trust = min(25, (user.behavior_trust or 0) + 2)
        TrustService.update_overall_score(user)
        db.flush()

    @staticmethod
    def apply_overdue_interest_surcharge(db: Session, loan):
        """
        +5% interest surcharge: increases the loan interest rate by 5 percentage
        points (e.g. 15%% -> 20%%) and adds the difference on remaining balance.
        Applied once per overdue installment (warning_penalty_applied flag).
        """
        from decimal import Decimal as D
        current_rate = D(str(loan.interest_rate or 15))
        new_rate = current_rate + D("5")
        loan.interest_rate = float(new_rate)
        remaining = loan.remaining_amount or D("0")
        surcharge = remaining * D("5") / D("100")
        loan.remaining_amount = remaining + surcharge
        loan.total_penalty_paid = (
            loan.total_penalty_paid or D("0")) + surcharge
        db.flush()
